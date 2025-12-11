use sqlx::{postgres::PgPoolOptions, PgPool, Row, Column, TypeInfo};
use uuid::Uuid;
use crate::models::*;
use std::time::Instant;

pub async fn test_connection(config: &ConnectionConfig) -> TestConnectionResult {
    let conn_str = config.connection_string();
    
    match PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&conn_str)
        .await
    {
        Ok(pool) => {
            let version: Result<(String,), _> = sqlx::query_as("SELECT version()")
                .fetch_one(&pool)
                .await;
            
            match version {
                Ok((ver,)) => TestConnectionResult {
                    success: true,
                    message: "Connection successful".to_string(),
                    version: Some(ver),
                },
                Err(_) => TestConnectionResult {
                    success: true,
                    message: "Connected but could not get version".to_string(),
                    version: None,
                },
            }
        }
        Err(e) => TestConnectionResult {
            success: false,
            message: format!("Connection failed: {}", e),
            version: None,
        },
    }
}

pub async fn connect(config: &ConnectionConfig) -> Result<PgPool, String> {
    let conn_str = config.connection_string();
    
    PgPoolOptions::new()
        .max_connections(20)
        .acquire_timeout(std::time::Duration::from_secs(30))
        .idle_timeout(std::time::Duration::from_secs(600))
        .connect(&conn_str)
        .await
        .map_err(|e| format!("PostgreSQL connection failed: {}", e))
}

pub async fn get_tables(pool: &PgPool) -> Result<Vec<TableInfo>, String> {
    let query = r#"
        SELECT 
            table_schema as schema,
            table_name as name,
            (SELECT reltuples::bigint FROM pg_class WHERE relname = table_name) as row_count
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
    "#;
    
    let rows = sqlx::query(query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to get tables: {}", e))?;
    
    let tables: Vec<TableInfo> = rows
        .iter()
        .map(|row| TableInfo {
            schema: row.get("schema"),
            name: row.get("name"),
            row_count: row.get::<Option<i64>, _>("row_count").map(|v| v as u64),
        })
        .collect();
    
    Ok(tables)
}

pub async fn get_table_structure(pool: &PgPool, table: &str) -> Result<TableStructure, String> {
    let query = r#"
        SELECT 
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku 
                ON tc.constraint_name = ku.constraint_name
            WHERE tc.constraint_type = 'PRIMARY KEY'
            AND ku.table_name = $1
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = $1
        ORDER BY c.ordinal_position
    "#;
    
    let rows = sqlx::query(query)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to get table structure: {}", e))?;
    
    let columns: Vec<ColumnInfo> = rows
        .iter()
        .map(|row| ColumnInfo {
            name: row.get("column_name"),
            data_type: row.get("data_type"),
            is_nullable: row.get::<String, _>("is_nullable") == "YES",
            is_primary_key: row.get("is_primary_key"),
            default_value: row.get("column_default"),
            is_unique: None,
            is_foreign_key: None,
            foreign_key_table: None,
            foreign_key_column: None,
            is_auto_increment: None,
            max_length: None,
            check_constraint: None,
        })
        .collect();
    
    Ok(TableStructure {
        table_name: table.to_string(),
        columns,
    })
}

pub async fn execute_query(pool: &PgPool, sql: &str) -> Result<QueryResult, String> {
    println!("[DEBUG postgres] execute_query starting: {}", sql);
    let start = Instant::now();
    
    // Use streaming to prevent loading too much data into memory
    use futures::TryStreamExt;
    let mut rows = Vec::new();
    let mut stream = sqlx::query(sql).fetch(pool);
    let mut truncated = false;
    let limit = 2000; // Hard limit for safety

    while let Some(row) = stream.try_next().await.map_err(|e| format!("Query execution failed: {}", e))? {
        rows.push(row);
        if rows.len() >= limit {
            truncated = true;
            break;
        }
    }
    
    println!("[DEBUG postgres] Query fetched {} rows (truncated: {})", rows.len(), truncated);
    let execution_time = start.elapsed().as_millis() as u64;
    
    if rows.is_empty() {
        return Ok(QueryResult {
            columns: vec![],
            rows: vec![],
            row_count: 0,
            execution_time_ms: execution_time,
            truncated: false,
        });
    }
    
    let columns: Vec<ResultColumn> = rows[0]
        .columns()
        .iter()
        .map(|c| ResultColumn {
            name: c.name().to_string(),
            type_name: c.type_info().name().to_string(),
        })
        .collect();
    
    println!("[DEBUG postgres] Columns: {:?}", columns);
    
    let mut result_rows: Vec<serde_json::Value> = Vec::new();
    
    for (row_idx, row) in rows.iter().enumerate() {
        let mut obj = serde_json::Map::new();
        for (i, col) in columns.iter().enumerate() {
            let value = row_value_to_json(&row, i);
            obj.insert(col.name.clone(), value);
        }
        result_rows.push(serde_json::Value::Object(obj));
        
        if row_idx == 0 {
            println!("[DEBUG postgres] First row processed successfully");
        }
    }
    
    println!("[DEBUG postgres] All {} rows processed", result_rows.len());
    
    let row_count = result_rows.len();
    
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        execution_time_ms: execution_time,
        truncated,
    })
}
fn row_value_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> serde_json::Value {
    use sqlx::ValueRef;
    
    // First check if the value is null
    if row.try_get_raw(idx).map(|v| v.is_null()).unwrap_or(true) {
        return serde_json::Value::Null;
    }
    
    // Try UUID first (very common in PostgreSQL)
    if let Ok(v) = row.try_get::<Uuid, _>(idx) {
        return serde_json::Value::String(v.to_string());
    }
    
    // Try string types (covers most text, varchar, char, etc.)
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return serde_json::Value::String(v);
    }
    
    // Try integer types
    if let Ok(v) = row.try_get::<i16, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<i32, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<i64, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    
    // Try float
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        return serde_json::json!(v);
    }
    if let Ok(v) = row.try_get::<f32, _>(idx) {
        return serde_json::json!(v);
    }
    
    // Try boolean
    if let Ok(v) = row.try_get::<bool, _>(idx) {
        return serde_json::Value::Bool(v);
    }
    
    // Try chrono datetime with timezone (timestamptz)
    if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(idx) {
        return serde_json::Value::String(v.to_rfc3339());
    }
    
    // Try chrono without timezone (timestamp)
    if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    
    // Try date
    if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d").to_string());
    }
    
    // Try time
    if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(idx) {
        return serde_json::Value::String(v.format("%H:%M:%S").to_string());
    }
    
    // Try JSON
    if let Ok(v) = row.try_get::<serde_json::Value, _>(idx) {
        return v;
    }
    
    // Try bytes as hex
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return serde_json::Value::String(format!("\\x{}", hex::encode(v)));
    }
    
    // Fallback: return null
    serde_json::Value::Null
}

pub async fn list_databases(pool: &PgPool) -> Result<Vec<String>, String> {
    let query = r#"
        SELECT datname 
        FROM pg_database 
        WHERE datistemplate = false 
        AND datname NOT IN ('postgres')
        ORDER BY datname
    "#;
    
    let rows = sqlx::query(query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list databases: {}", e))?;
    
    let databases: Vec<String> = rows
        .iter()
        .map(|row| row.get("datname"))
        .collect();
    
    Ok(databases)
}
