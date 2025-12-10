use sqlx::{mssql::MssqlPoolOptions, MssqlPool, Row, Column, TypeInfo};
use crate::models::*;
use std::time::Instant;

pub async fn test_connection(config: &ConnectionConfig) -> TestConnectionResult {
    let conn_str = config.connection_string();
    
    match MssqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&conn_str)
        .await
    {
        Ok(pool) => {
            let version: Result<(String,), _> = sqlx::query_as("SELECT @@VERSION")
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

pub async fn connect(config: &ConnectionConfig) -> Result<MssqlPool, String> {
    let conn_str = config.connection_string();
    
    MssqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&conn_str)
        .await
        .map_err(|e| format!("SQL Server connection failed: {}", e))
}

pub async fn get_tables(pool: &MssqlPool) -> Result<Vec<TableInfo>, String> {
    let query = r#"
        SELECT 
            TABLE_SCHEMA as [schema],
            TABLE_NAME as name,
            (SELECT SUM(p.rows) 
             FROM sys.partitions p 
             INNER JOIN sys.tables t ON p.object_id = t.object_id 
             WHERE t.name = TABLES.TABLE_NAME AND p.index_id IN (0,1)) as row_count
        FROM INFORMATION_SCHEMA.TABLES AS TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA NOT IN ('sys')
        ORDER BY TABLE_SCHEMA, TABLE_NAME
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
            row_count: row.get::<Option<i64>, _>("row_count"),
        })
        .collect();
    
    Ok(tables)
}

pub async fn get_table_structure(pool: &MssqlPool, table: &str) -> Result<TableStructure, String> {
    let query = r#"
        SELECT 
            c.COLUMN_NAME as column_name,
            c.DATA_TYPE as data_type,
            c.IS_NULLABLE as is_nullable,
            c.COLUMN_DEFAULT as column_default,
            CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as is_primary_key
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
            SELECT ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku 
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND ku.TABLE_NAME = @P1
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = @P1
        ORDER BY c.ORDINAL_POSITION
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
            is_primary_key: row.get::<i32, _>("is_primary_key") == 1,
            default_value: row.get("column_default"),
        })
        .collect();
    
    Ok(TableStructure {
        table_name: table.to_string(),
        columns,
    })
}

pub async fn execute_query(pool: &MssqlPool, sql: &str) -> Result<QueryResult, String> {
    let start = Instant::now();
    
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

fn row_value_to_json(row: &sqlx::mssql::MssqlRow, idx: usize) -> serde_json::Value {
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
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return serde_json::Value::String(v);
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

pub async fn list_databases(pool: &MssqlPool) -> Result<Vec<String>, String> {
    let rows = sqlx::query("SELECT name FROM sys.databases WHERE database_id > 4")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list databases: {}", e))?;
    
    let databases: Vec<String> = rows
        .iter()
        .map(|row| row.get(0))
        .collect();
    
    Ok(databases)
}
