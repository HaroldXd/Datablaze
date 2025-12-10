use tiberius::{Client, Config, AuthMethod, Row, Column};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use bb8::Pool;
use bb8_tiberius::ConnectionManager;
use crate::models::*;
use std::time::Instant;
use log::{info, error, debug};

pub type SqlServerPool = Pool<ConnectionManager>;

pub async fn test_connection(config: &ConnectionConfig) -> TestConnectionResult {
    info!("SQL Server: Testing connection to {}:{}", config.host, config.port);
    
    let mut tiberius_config = Config::new();
    
    tiberius_config.host(&config.host);
    tiberius_config.port(config.port);
    tiberius_config.authentication(AuthMethod::sql_server(&config.username, &config.password));
    tiberius_config.trust_cert();
    
    if !config.database.is_empty() {
        tiberius_config.database(&config.database);
        debug!("SQL Server: Using database '{}'", config.database);
    }

    let addr = tiberius_config.get_addr();
    info!("SQL Server: Connecting to address {:?}", addr);
    
    match TcpStream::connect(&addr).await {
        Ok(tcp) => {
            info!("SQL Server: TCP connection established");
            tcp.set_nodelay(true).ok();
            
            match Client::connect(tiberius_config, tcp.compat_write()).await {
                Ok(mut client) => {
                    info!("SQL Server: TDS connection successful");
                    // Get SQL Server version
                    let query_result = client.simple_query("SELECT @@VERSION").await;
                    
                    match query_result {
                        Ok(stream) => {
                            let rows: Vec<_> = stream.into_first_result().await.unwrap_or_default();
                            let version = rows.first()
                                .and_then(|row| row.get::<&str, _>(0))
                                .map(|v| {
                                    // Extract just the first line of the version string
                                    v.lines().next().unwrap_or(v).to_string()
                                });
                            
                            info!("SQL Server: Connection test passed. Version: {:?}", version);
                            TestConnectionResult {
                                success: true,
                                message: "Connection successful".to_string(),
                                version,
                            }
                        }
                        Err(e) => {
                            error!("SQL Server: Could not get version: {}", e);
                            TestConnectionResult {
                                success: true,
                                message: "Connected but could not get version".to_string(),
                                version: None,
                            }
                        },
                    }
                }
                Err(e) => {
                    error!("SQL Server: TDS connection failed: {}", e);
                    TestConnectionResult {
                        success: false,
                        message: format!("Connection failed: {}", e),
                        version: None,
                    }
                },
            }
        }
        Err(e) => {
            error!("SQL Server: TCP connection failed to {:?}: {}", addr, e);
            TestConnectionResult {
                success: false,
                message: format!("Failed to connect to server: {}", e),
                version: None,
            }
        },
    }
}

pub async fn connect(config: &ConnectionConfig) -> Result<SqlServerPool, String> {
    info!("SQL Server: Creating connection pool to {}:{}/{}", config.host, config.port, config.database);
    
    let mut tiberius_config = Config::new();
    
    tiberius_config.host(&config.host);
    tiberius_config.port(config.port);
    tiberius_config.authentication(AuthMethod::sql_server(&config.username, &config.password));
    tiberius_config.trust_cert();
    
    if !config.database.is_empty() {
        tiberius_config.database(&config.database);
    }

    let manager = ConnectionManager::new(tiberius_config);
    
    match Pool::builder()
        .max_size(5)
        .build(manager)
        .await {
        Ok(pool) => {
            info!("SQL Server: Connection pool created successfully");
            Ok(pool)
        }
        Err(e) => {
            error!("SQL Server: Failed to create connection pool: {}", e);
            Err(format!("SQL Server connection failed: {}", e))
        }
    }
}

pub async fn get_tables(pool: &SqlServerPool) -> Result<Vec<TableInfo>, String> {
    info!("SQL Server: Getting tables list");
    
    let mut conn = pool.get().await.map_err(|e| {
        error!("SQL Server: Failed to get connection from pool: {}", e);
        format!("Failed to get connection: {}", e)
    })?;
    
    info!("SQL Server: Got connection from pool, executing query");
    
    let query = r#"
        SELECT 
            s.name AS schema_name,
            t.name AS table_name,
            p.rows AS row_count
        FROM sys.tables t
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
        WHERE t.type = 'U'
        ORDER BY s.name, t.name
    "#;
    
    let stream = conn.simple_query(query).await
        .map_err(|e| {
            error!("SQL Server: Query failed: {}", e);
            format!("Failed to get tables: {}", e)
        })?;
    
    info!("SQL Server: Query executed, fetching results");
    
    let rows: Vec<_> = stream.into_first_result().await
        .map_err(|e| {
            error!("SQL Server: Failed to get query results: {}", e);
            format!("Failed to get tables: {}", e)
        })?;
    
    info!("SQL Server: Got {} rows from query", rows.len());
    
    let mut tables = Vec::new();
    
    for row in rows {
        let schema: String = row.get::<&str, _>("schema_name")
            .map(|s| s.to_string())
            .unwrap_or_else(|| "dbo".to_string());
        let name: String = row.get::<&str, _>("table_name")
            .map(|s| s.to_string())
            .unwrap_or_default();
        let row_count: Option<i64> = row.get::<i64, _>("row_count");
        
        debug!("SQL Server: Found table {}.{}", schema, name);
        
        tables.push(TableInfo {
            schema,
            name,
            row_count,
        });
    }
    
    info!("SQL Server: Returning {} tables", tables.len());
    Ok(tables)
}

pub async fn get_table_structure(pool: &SqlServerPool, table: &str) -> Result<TableStructure, String> {
    let mut conn = pool.get().await.map_err(|e| format!("Failed to get connection: {}", e))?;
    
    // Parse table name (handle schema.table format)
    let (schema, table_name) = if table.contains('.') {
        let parts: Vec<&str> = table.splitn(2, '.').collect();
        (parts[0], parts[1])
    } else {
        ("dbo", table)
    };
    
    let query = format!(r#"
        SELECT 
            c.name AS column_name,
            t.name AS data_type,
            c.is_nullable,
            CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
            dc.definition AS default_value
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        INNER JOIN sys.tables tb ON c.object_id = tb.object_id
        INNER JOIN sys.schemas s ON tb.schema_id = s.schema_id
        LEFT JOIN (
            SELECT ic.object_id, ic.column_id
            FROM sys.index_columns ic
            INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
            WHERE i.is_primary_key = 1
        ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
        LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
        WHERE s.name = '{}' AND tb.name = '{}'
        ORDER BY c.column_id
    "#, schema, table_name);
    
    let stream = conn.simple_query(&query).await
        .map_err(|e| format!("Failed to get table structure: {}", e))?;
    
    let rows: Vec<_> = stream.into_first_result().await
        .map_err(|e| format!("Failed to get table structure: {}", e))?;
    
    let columns: Vec<ColumnInfo> = rows.iter().map(|row| {
        ColumnInfo {
            name: row.get::<&str, _>("column_name")
                .map(|s| s.to_string())
                .unwrap_or_default(),
            data_type: row.get::<&str, _>("data_type")
                .map(|s| s.to_string())
                .unwrap_or_default(),
            is_nullable: row.get::<bool, _>("is_nullable").unwrap_or(true),
            is_primary_key: row.get::<i32, _>("is_primary_key").unwrap_or(0) > 0,
            default_value: row.get::<&str, _>("default_value").map(|s| s.to_string()),
            is_unique: None,
            is_foreign_key: None,
            foreign_key_table: None,
            foreign_key_column: None,
            is_auto_increment: None,
            max_length: None,
            check_constraint: None,
        }
    }).collect();
    
    Ok(TableStructure {
        table_name: table.to_string(),
        columns,
    })
}

pub async fn execute_query(pool: &SqlServerPool, sql: &str) -> Result<QueryResult, String> {
    let start = Instant::now();
    let mut conn = pool.get().await.map_err(|e| format!("Failed to get connection: {}", e))?;
    
    let stream = conn.simple_query(sql).await
        .map_err(|e| format!("Query execution failed: {}", e))?;
    
    let rows: Vec<Row> = stream.into_first_result().await
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
    
    // Get column information from the first row
    let columns: Vec<ResultColumn> = rows[0].columns().iter().map(|c| {
        ResultColumn {
            name: c.name().to_string(),
            type_name: format!("{:?}", c.column_type()),
        }
    }).collect();
    
    let mut result_rows: Vec<serde_json::Value> = Vec::new();
    
    for row in &rows {
        let mut obj = serde_json::Map::new();
        for (i, col) in row.columns().iter().enumerate() {
            let value = column_to_json(&row, i, col);
            obj.insert(col.name().to_string(), value);
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

fn column_to_json(row: &Row, idx: usize, _col: &Column) -> serde_json::Value {
    // Try different types in order of likelihood
    // Use try_get to avoid panics on type mismatches
    // Check i64 first (BIGINT is common for IDs in SQL Server)
    if let Ok(Some(v)) = row.try_get::<i64, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(Some(v)) = row.try_get::<i32, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(Some(v)) = row.try_get::<i16, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(Some(v)) = row.try_get::<u8, _>(idx) {
        return serde_json::Value::Number(v.into());
    }
    if let Ok(Some(v)) = row.try_get::<f64, _>(idx) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<f32, _>(idx) {
        return serde_json::json!(v);
    }
    if let Ok(Some(v)) = row.try_get::<bool, _>(idx) {
        return serde_json::Value::Bool(v);
    }
    if let Ok(Some(v)) = row.try_get::<&str, _>(idx) {
        return serde_json::Value::String(v.to_string());
    }
    if let Ok(Some(v)) = row.try_get::<uuid::Uuid, _>(idx) {
        return serde_json::Value::String(v.to_string());
    }
    if let Ok(Some(v)) = row.try_get::<&[u8], _>(idx) {
        return serde_json::Value::String(format!("0x{}", hex::encode(v)));
    }
    if let Ok(Some(v)) = row.try_get::<chrono::NaiveDateTime, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string());
    }
    if let Ok(Some(v)) = row.try_get::<chrono::NaiveDate, _>(idx) {
        return serde_json::Value::String(v.format("%Y-%m-%d").to_string());
    }
    if let Ok(Some(v)) = row.try_get::<chrono::NaiveTime, _>(idx) {
        return serde_json::Value::String(v.format("%H:%M:%S").to_string());
    }
    
    serde_json::Value::Null
}

pub async fn list_databases(pool: &SqlServerPool) -> Result<Vec<String>, String> {
    let mut conn = pool.get().await.map_err(|e| format!("Failed to get connection: {}", e))?;
    
    let stream = conn.simple_query("SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name").await
        .map_err(|e| format!("Failed to list databases: {}", e))?;
    
    let rows: Vec<_> = stream.into_first_result().await
        .map_err(|e| format!("Failed to list databases: {}", e))?;
    
    let databases: Vec<String> = rows.iter()
        .filter_map(|row| row.get::<&str, _>("name").map(|s| s.to_string()))
        .collect();
    
    Ok(databases)
}
