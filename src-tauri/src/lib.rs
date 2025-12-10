pub mod database;
pub mod commands;
pub mod models;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(database::ConnectionManager::new())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            connect_database,
            disconnect_database,
            execute_query,
            get_tables,
            get_table_structure,
            get_table_data,
            list_databases
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
