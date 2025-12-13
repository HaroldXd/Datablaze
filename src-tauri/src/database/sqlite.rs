use sqlx::{sqlite::SqlitePoolOptions, SqlitePool, Row, Column, TypeInfo};
use crate::models::*;
use std::time::Instant;

pub async fn test_connection(config: &ConnectionConfig) -> TestConnectionResult {
    let conn_str = config.connection_string();
    
    match SqlitePoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&conn_str)
        .await
    {
        Ok(pool) => {
            let version: Result<(String,), _> = sqlx::query_as("SELECT sqlite_version()")
                .fetch_one(&pool)
                .await;
            
            match version {
                Ok((ver,)) => TestConnectionResult {
                    success: true,
                    message: "Connection successful".to_string(),
                    version: Some(format!("SQLite {}", ver)),
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

pub async fn connect(config: &ConnectionConfig) -> Result<SqlitePool, String> {
    let conn_str = config.connection_string();
    
    SqlitePoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&conn_str)
        .await
        .map_err(|e| format!("SQLite connection failed: {}", e))
}

pub async fn get_tables(pool: &SqlitePool) -> Result<Vec<TableInfo>, String> {
    let query = r#"
        SELECT 
            'main' as schema,
            name,
            NULL as row_count
        FROM sqlite_master 
        WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    "#;
    
    let rows = sqlx::query(query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to get tables: {}", e))?;
    
    let mut tables: Vec<TableInfo> = Vec::new();
    
    for row in rows.iter() {
        let name: String = row.get("name");
        
        // Get row count for each table
        let count_query = format!("SELECT COUNT(*) as count FROM {}", name);
        let row_count = sqlx::query(&count_query)
            .fetch_one(pool)
            .await
            .ok()
            .and_then(|r| r.try_get::<i64, _>("count").ok())
            .map(|v| v as u64);
        
        tables.push(TableInfo {
            schema: row.get("schema"),
            name,
            row_count,
        });
    }
    
    Ok(tables)
}

pub async fn get_table_structure(pool: &SqlitePool, table: &str) -> Result<TableStructure, String> {
    let query = format!("PRAGMA table_info({})", table);
    
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to get table structure: {}", e))?;
    
    let columns: Vec<ColumnInfo> = rows
        .iter()
        .map(|row| {
            let name: String = row.try_get("name").unwrap_or_default();
            let data_type: String = row.try_get("type").unwrap_or_default();
            let notnull: i32 = row.try_get("notnull").unwrap_or(0);
            let pk: i32 = row.try_get("pk").unwrap_or(0);
            let default_value: Option<String> = row.try_get("dflt_value").ok();
            
            ColumnInfo {
                name,
                data_type,
                is_nullable: notnull == 0,
                is_primary_key: pk > 0,
                default_value,
                is_unique: None,
                is_foreign_key: None,
                foreign_key_table: None,
                foreign_key_column: None,
                is_auto_increment: None,
                max_length: None,
                check_constraint: None,
            }
        })
        .collect();
    
    Ok(TableStructure {
        table_name: table.to_string(),
        columns,
    })
}

pub async fn execute_query(pool: &SqlitePool, sql: &str) -> Result<QueryResult, String> {
    let start = Instant::now();
    
    let sql_upper = sql.trim().to_uppercase();
    
    // For UPDATE, INSERT, DELETE - use execute which returns affected rows
    if sql_upper.starts_with("UPDATE") || sql_upper.starts_with("INSERT") || sql_upper.starts_with("DELETE") {
        log::info!("SQLite: Executing modification query: {}", sql);
        
        let result = sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Query execution failed: {}", e))?;
        
        let affected = result.rows_affected();
        log::info!("SQLite: {} rows affected", affected);
        
        let execution_time = start.elapsed().as_millis() as u64;
        
        return Ok(QueryResult {
            columns: vec![ResultColumn {
                name: "affected_rows".to_string(),
                type_name: "INTEGER".to_string(),
            }],
            rows: vec![serde_json::json!({"affected_rows": affected})],
            row_count: affected as usize,
            execution_time_ms: execution_time,
            truncated: false,
        });
    }
    
    // For SELECT queries
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Query execution failed: {}", e))?;
    
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
    
    let mut result_rows: Vec<serde_json::Value> = Vec::new();
    
    for row in &rows {
        let mut obj = serde_json::Map::new();
        for (i, col) in columns.iter().enumerate() {
            let value = row_value_to_json(&row, i);
            obj.insert(col.name.clone(), value);
        }
        result_rows.push(serde_json::Value::Object(obj));
    }
    
    let row_count = result_rows.len();
    
    Ok(QueryResult {
        columns,
        rows: result_rows,
        row_count,
        execution_time_ms: execution_time,
        truncated: false,
    })
}

fn row_value_to_json(row: &sqlx::sqlite::SqliteRow, idx: usize) -> serde_json::Value {
    // Try different types
    if let Ok(v) = row.try_get::<i32, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<i64, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        return serde_json::json!(v);
    }
    if let Ok(v) = row.try_get::<bool, _>(idx) {
        return serde_json::Value::Bool(v);
    }
    // Date and Time types - SQLite stores as TEXT but sqlx can decode them
    if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d").to_string());
    }
    if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    if let Ok(v) = row.try_get::<chrono::NaiveTime, _>(idx) {
        return serde_json::Value::String(v.format("%H:%M:%S").to_string());
    }
    if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    // Strings
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return serde_json::Value::String(v);
    }
    // Try bytes (BLOB) - convert to string if valid UTF-8, otherwise hex
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        if let Ok(s) = String::from_utf8(v.clone()) {
            return serde_json::Value::String(s);
        }
        return serde_json::Value::String(format!("0x{}", hex::encode(v)));
    }
    if let Ok(v) = row.try_get::<serde_json::Value, _>(idx) {
        return v;
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return match v {
            Some(s) => serde_json::Value::String(s),
            None => serde_json::Value::Null,
        };
    }
    
    serde_json::Value::Null
}

pub async fn list_databases(_pool: &SqlitePool) -> Result<Vec<String>, String> {
    // SQLite doesn't support multiple databases in the traditional sense
    // Return an empty list or the current database name
    Ok(vec!["main".to_string()])
}
