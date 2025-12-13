use sqlx::{mysql::MySqlPoolOptions, MySqlPool, Row, Column, TypeInfo};
use crate::models::*;
use std::time::Instant;

pub async fn test_connection(config: &ConnectionConfig) -> TestConnectionResult {
    let conn_str = config.connection_string();
    
    match MySqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(&conn_str)
        .await
    {
        Ok(pool) => {
            let version: Result<(String,), _> = sqlx::query_as("SELECT VERSION()")
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

pub async fn connect(config: &ConnectionConfig) -> Result<MySqlPool, String> {
    let conn_str = config.connection_string();
    
    MySqlPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&conn_str)
        .await
        .map_err(|e| format!("MySQL connection failed: {}", e))
}

pub async fn get_tables(pool: &MySqlPool) -> Result<Vec<TableInfo>, String> {
    let query = r#"
        SELECT 
            TABLE_SCHEMA as `schema`,
            TABLE_NAME as name,
            TABLE_ROWS as row_count
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
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
            row_count: row.get::<Option<u64>, _>("row_count"),
        })
        .collect();
    
    Ok(tables)
}

pub async fn get_table_structure(pool: &MySqlPool, table: &str) -> Result<TableStructure, String> {
    let query = r#"
        SELECT 
            COLUMN_NAME as column_name,
            DATA_TYPE as data_type,
            IS_NULLABLE as is_nullable,
            COLUMN_DEFAULT as column_default,
            COLUMN_KEY as column_key
        FROM information_schema.COLUMNS
        WHERE TABLE_NAME = ?
        AND TABLE_SCHEMA = DATABASE()
        ORDER BY ORDINAL_POSITION
    "#;
    
    let rows = sqlx::query(query)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to get table structure: {}", e))?;
    
    let columns: Vec<ColumnInfo> = rows
        .iter()
        .map(|row| {
            // Helper to get string, trying String first then bytes
            let get_string = |col: &str| -> String {
                if let Ok(v) = row.try_get::<String, _>(col) {
                    return v;
                }
                if let Ok(v) = row.try_get::<Vec<u8>, _>(col) {
                    return String::from_utf8_lossy(&v).to_string();
                }
                String::new()
            };
            
            let get_optional_string = |col: &str| -> Option<String> {
                if let Ok(v) = row.try_get::<Option<String>, _>(col) {
                    return v;
                }
                if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(col) {
                    return v.map(|bytes| String::from_utf8_lossy(&bytes).to_string());
                }
                None
            };
            
            let column_name = get_string("column_name");
            let data_type = get_string("data_type");
            let is_nullable = get_string("is_nullable");
            let column_default = get_optional_string("column_default");
            let column_key = get_string("column_key");
            
            ColumnInfo {
                name: column_name,
                data_type,
                is_nullable: is_nullable == "YES",
                is_primary_key: column_key == "PRI",
                default_value: column_default,
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

pub async fn execute_query(pool: &MySqlPool, sql: &str) -> Result<QueryResult, String> {
    let start = Instant::now();
    
    let sql_upper = sql.trim().to_uppercase();
    
    // For UPDATE, INSERT, DELETE - use execute which returns affected rows
    if sql_upper.starts_with("UPDATE") || sql_upper.starts_with("INSERT") || sql_upper.starts_with("DELETE") {
        log::info!("MySQL: Executing modification query: {}", sql);
        
        let result = sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("Query execution failed: {}", e))?;
        
        let affected = result.rows_affected();
        log::info!("MySQL: {} rows affected", affected);
        
        let execution_time = start.elapsed().as_millis() as u64;
        
        return Ok(QueryResult {
            columns: vec![ResultColumn {
                name: "affected_rows".to_string(),
                type_name: "BIGINT".to_string(),
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

fn row_value_to_json(row: &sqlx::mysql::MySqlRow, idx: usize) -> serde_json::Value {
    // Try unsigned integers first (common for MySQL IDs)
    if let Ok(v) = row.try_get::<u64, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<u32, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    // Then signed integers
    if let Ok(v) = row.try_get::<i64, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<i32, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<i16, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(v) = row.try_get::<i8, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    // Floats
    if let Ok(v) = row.try_get::<f64, _>(idx) {
        return serde_json::json!(v);
    }
    if let Ok(v) = row.try_get::<f32, _>(idx) {
        return serde_json::json!(v);
    }
    // Date and Time types - IMPORTANT for MySQL dates
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
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return match v {
            Some(s) => serde_json::Value::String(s),
            None => serde_json::Value::Null,
        };
    }
    // Try bytes (BLOB, BINARY, VARBINARY) - convert to string if valid UTF-8, otherwise hex
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        // Try to convert to UTF-8 string first
        if let Ok(s) = String::from_utf8(v.clone()) {
            return serde_json::Value::String(s);
        }
        // Otherwise return as hex
        return serde_json::Value::String(format!("0x{}", hex::encode(v)));
    }
    // JSON values
    if let Ok(v) = row.try_get::<serde_json::Value, _>(idx) {
        return v;
    }
    // Boolean last (to avoid TINYINT being converted to bool)
    if let Ok(v) = row.try_get::<bool, _>(idx) {
        return serde_json::Value::Bool(v);
    }
    
    serde_json::Value::Null
}

pub async fn list_databases(pool: &MySqlPool) -> Result<Vec<String>, String> {
    let rows = sqlx::query("SHOW DATABASES")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list databases: {}", e))?;
    
    let databases: Vec<String> = rows
        .iter()
        .filter_map(|row| {
            // Try String first, then bytes
            let db: String = row.try_get::<String, _>(0)
                .or_else(|_| {
                    row.try_get::<Vec<u8>, _>(0)
                        .map(|bytes| String::from_utf8_lossy(&bytes).to_string())
                })
                .unwrap_or_default();
            
            // Exclude system databases
            if !db.is_empty() && !["information_schema", "mysql", "performance_schema", "sys"].contains(&db.as_str()) {
                Some(db)
            } else {
                None
            }
        })
        .collect();
    
    Ok(databases)
}

