use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DatabaseType {
    PostgreSQL,
    MySQL,
    SQLite,
    SQLServer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub name: String,
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub config: ConnectionConfig,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub schema: String,
    pub row_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_unique: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_foreign_key: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreign_key_table: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreign_key_column: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_auto_increment: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_constraint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableStructure {
    pub table_name: String,
    pub columns: Vec<ColumnInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultColumn {
    pub name: String,
    pub type_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<ResultColumn>,
    pub rows: Vec<serde_json::Value>,
    pub row_count: usize,
    pub execution_time_ms: u64,
    #[serde(default)] // Default to false if missing in JSON (backwards compat)
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub message: String,
    pub version: Option<String>,
}

impl ConnectionConfig {
    pub fn connection_string(&self) -> String {
        // URL-encode username and password for special characters
        let encoded_username = urlencoding::encode(&self.username);
        let encoded_password = urlencoding::encode(&self.password);
        
        match self.db_type {
            DatabaseType::PostgreSQL => {
                format!(
                    "postgres://{}:{}@{}:{}/{}",
                    encoded_username, encoded_password, self.host, self.port, self.database
                )
            }
            DatabaseType::MySQL => {
                format!(
                    "mysql://{}:{}@{}:{}/{}",
                    encoded_username, encoded_password, self.host, self.port, self.database
                )
            }
            DatabaseType::SQLite => {
                // SQLite uses file path as database with proper URI format
                // This allows creating the file if it doesn't exist
                format!("sqlite:{}?mode=rwc", self.database)
            }
            DatabaseType::SQLServer => {
                // SQL Server connection string format for Tiberius
                // Format: server=host;port=port;database=db;user=user;password=pass
                format!(
                    "server=tcp:{},{};database={};user={};password={};TrustServerCertificate=true",
                    self.host, self.port, self.database, self.username, self.password
                )
            }
        }
    }
}
