import { invoke } from '@tauri-apps/api/core';

// Types
export interface DatabaseType {
  PostgreSQL?: {};
  MySQL?: {};
  SQLServer?: {};
  SQLite?: {};
}

export interface ConnectionConfig {
  name: string;
  db_type: 'PostgreSQL' | 'MySQL' | 'SQLServer' | 'SQLite';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface Connection {
  id: string;
  config: ConnectionConfig;
  connected: boolean;
}

export interface TableInfo {
  name: string;
  schema: string;
  row_count: number | null;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  default_value: string | null;
}

export interface TableStructure {
  table_name: string;
  columns: ColumnInfo[];
}

export interface ResultColumn {
  name: string;
  type_name: string;
}

export interface QueryResult {
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  row_count: number;
  execution_time_ms: number;
  truncated?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  version: string | null;
}

// API Functions
export async function testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
  return invoke('test_connection', { config });
}

export async function connectDatabase(config: ConnectionConfig): Promise<Connection> {
  return invoke('connect_database', { config });
}

export async function disconnectDatabase(id: string): Promise<boolean> {
  return invoke('disconnect_database', { id });
}

export async function executeQuery(id: string, sql: string): Promise<QueryResult> {
  return invoke('execute_query', { id, sql });
}

export async function getTables(id: string): Promise<TableInfo[]> {
  return invoke('get_tables', { id });
}

export async function getTableStructure(id: string, table: string): Promise<TableStructure> {
  return invoke('get_table_structure', { id, table });
}

export async function getTableData(id: string, table: string, limit: number): Promise<QueryResult> {
  return invoke('get_table_data', { id, table, limit });
}

export async function listDatabases(id: string): Promise<string[]> {
  return invoke('list_databases', { id });
}
