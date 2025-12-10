// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Initialize logger for debug output
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();
    
    datablaze_lib::run()
}
