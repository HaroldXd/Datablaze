pub mod postgres;
pub mod mysql;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::models::*;

pub enum DatabaseConnection {
    PostgreSQL(sqlx::PgPool),
    MySQL(sqlx::MySqlPool),
}

pub struct ConnectionManager {
    connections: Arc<Mutex<HashMap<String, DatabaseConnection>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn add_connection(&self, id: String, conn: DatabaseConnection) {
        let mut conns = self.connections.lock().await;
        conns.insert(id, conn);
    }

    pub async fn remove_connection(&self, id: &str) -> bool {
        let mut conns = self.connections.lock().await;
        conns.remove(id).is_some()
    }

    pub async fn get_connection(&self, id: &str) -> Option<DatabaseConnection> {
        let conns = self.connections.lock().await;
        match conns.get(id) {
            Some(DatabaseConnection::PostgreSQL(pool)) => {
                Some(DatabaseConnection::PostgreSQL(pool.clone()))
            }
            Some(DatabaseConnection::MySQL(pool)) => {
                Some(DatabaseConnection::MySQL(pool.clone()))
            }
            None => None,
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn test_database_connection(config: &ConnectionConfig) -> TestConnectionResult {
    match config.db_type {
        DatabaseType::PostgreSQL => postgres::test_connection(config).await,
        DatabaseType::MySQL => mysql::test_connection(config).await,
    }
}

pub async fn connect_to_database(config: &ConnectionConfig) -> Result<DatabaseConnection, String> {
    match config.db_type {
        DatabaseType::PostgreSQL => {
            let pool = postgres::connect(config).await?;
            Ok(DatabaseConnection::PostgreSQL(pool))
        }
        DatabaseType::MySQL => {
            let pool = mysql::connect(config).await?;
            Ok(DatabaseConnection::MySQL(pool))
        }
    }
}

pub async fn get_tables_list(conn: &DatabaseConnection) -> Result<Vec<TableInfo>, String> {
    match conn {
        DatabaseConnection::PostgreSQL(pool) => postgres::get_tables(pool).await,
        DatabaseConnection::MySQL(pool) => mysql::get_tables(pool).await,
    }
}

pub async fn get_table_structure_info(conn: &DatabaseConnection, table: &str) -> Result<TableStructure, String> {
    match conn {
        DatabaseConnection::PostgreSQL(pool) => postgres::get_table_structure(pool, table).await,
        DatabaseConnection::MySQL(pool) => mysql::get_table_structure(pool, table).await,
    }
}

pub async fn execute_sql_query(conn: &DatabaseConnection, sql: &str) -> Result<QueryResult, String> {
    match conn {
        DatabaseConnection::PostgreSQL(pool) => postgres::execute_query(pool, sql).await,
        DatabaseConnection::MySQL(pool) => mysql::execute_query(pool, sql).await,
    }
}

pub async fn get_table_data_rows(conn: &DatabaseConnection, table: &str, limit: u32) -> Result<QueryResult, String> {
    let sql = format!("SELECT * FROM {} LIMIT {}", table, limit);
    execute_sql_query(conn, &sql).await
}

pub async fn list_databases(conn: &DatabaseConnection) -> Result<Vec<String>, String> {
    match conn {
        DatabaseConnection::PostgreSQL(pool) => postgres::list_databases(pool).await,
        DatabaseConnection::MySQL(pool) => mysql::list_databases(pool).await,
    }
}
