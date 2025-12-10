use tauri::State;
use uuid::Uuid;
use crate::database::ConnectionManager;
use crate::models::*;

#[tauri::command]
pub async fn test_connection(config: ConnectionConfig) -> Result<TestConnectionResult, String> {
    Ok(crate::database::test_database_connection(&config).await)
}

#[tauri::command]
pub async fn connect_database(
    config: ConnectionConfig,
    state: State<'_, ConnectionManager>,
) -> Result<Connection, String> {
    let conn = crate::database::connect_to_database(&config).await?;
    let id = Uuid::new_v4().to_string();
    
    state.add_connection(id.clone(), conn).await;
    
    Ok(Connection {
        id,
        config,
        connected: true,
    })
}

#[tauri::command]
pub async fn disconnect_database(
    id: String,
    state: State<'_, ConnectionManager>,
) -> Result<bool, String> {
    Ok(state.remove_connection(&id).await)
}

#[tauri::command]
pub async fn execute_query(
    id: String,
    sql: String,
    state: State<'_, ConnectionManager>,
) -> Result<QueryResult, String> {
    let conn = state
        .get_connection(&id)
        .await
        .ok_or_else(|| "Connection not found".to_string())?;
    
    crate::database::execute_sql_query(&conn, &sql).await
}

#[tauri::command]
pub async fn get_tables(
    id: String,
    state: State<'_, ConnectionManager>,
) -> Result<Vec<TableInfo>, String> {
    log::info!("[get_tables] Called for connection id: {}", id);
    
    let conn = state
        .get_connection(&id)
        .await
        .ok_or_else(|| {
            log::error!("[get_tables] Connection not found: {}", id);
            "Connection not found".to_string()
        })?;
    
    log::info!("[get_tables] Connection found, fetching tables...");
    
    let result = crate::database::get_tables_list(&conn).await;
    
    match &result {
        Ok(tables) => log::info!("[get_tables] Success: {} tables found", tables.len()),
        Err(e) => log::error!("[get_tables] Error: {}", e),
    }
    
    result
}

#[tauri::command]
pub async fn get_table_structure(
    id: String,
    table: String,
    state: State<'_, ConnectionManager>,
) -> Result<TableStructure, String> {
    let conn = state
        .get_connection(&id)
        .await
        .ok_or_else(|| "Connection not found".to_string())?;
    
    crate::database::get_table_structure_info(&conn, &table).await
}

#[tauri::command]
pub async fn get_table_data(
    id: String,
    table: String,
    limit: u32,
    state: State<'_, ConnectionManager>,
) -> Result<QueryResult, String> {
    println!("[DEBUG] get_table_data called: table={}, limit={}", table, limit);
    
    let conn = state
        .get_connection(&id)
        .await
        .ok_or_else(|| "Connection not found".to_string())?;
    
    println!("[DEBUG] Connection found, executing query...");
    
    let result = crate::database::get_table_data_rows(&conn, &table, limit).await;
    
    println!("[DEBUG] Query finished: {:?}", result.is_ok());
    
    result
}

#[tauri::command]
pub async fn list_databases(
    id: String,
    state: State<'_, ConnectionManager>,
) -> Result<Vec<String>, String> {
    let conn = state
        .get_connection(&id)
        .await
        .ok_or_else(|| "Connection not found".to_string())?;
    
    crate::database::list_databases(&conn).await
}
