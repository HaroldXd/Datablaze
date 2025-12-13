import { ConnectionConfig } from './tauri';

const STORAGE_KEY = 'datablaze_saved_connections';

export interface SavedConnection {
    id: string;
    config: ConnectionConfig;
    savePassword: boolean;
    createdAt: string;
}

export function getSavedConnections(): SavedConnection[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Failed to load saved connections:', error);
    }
    return [];
}

export function saveConnection(id: string, config: ConnectionConfig, savePassword: boolean = true): void {
    try {
        const connections = getSavedConnections();

        // Check if connection with same name already exists
        const existingByName = connections.findIndex(c =>
            c.config.name === config.name && c.id !== id
        );

        // If exists by name, update that one instead
        const existingIndex = existingByName >= 0 ? existingByName : connections.findIndex(c => c.id === id);

        const savedConn: SavedConnection = {
            id,
            config: savePassword ? config : { ...config, password: '' },
            savePassword,
            createdAt: new Date().toISOString(),
        };

        if (existingIndex >= 0) {
            connections[existingIndex] = savedConn;
        } else {
            connections.push(savedConn);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
    } catch (error) {
        console.error('Failed to save connection:', error);
    }
}

export function updateSavedConnection(id: string, config: ConnectionConfig, savePassword: boolean = true): void {
    saveConnection(id, config, savePassword);
}

export function removeSavedConnection(id: string): void {
    try {
        const connections = getSavedConnections();
        const filtered = connections.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Failed to remove saved connection:', error);
    }
}

export function clearAllConnections(): void {
    localStorage.removeItem(STORAGE_KEY);
}

// Clear duplicates on load
export function cleanupDuplicates(): void {
    try {
        const connections = getSavedConnections();
        const seen = new Map<string, SavedConnection>();

        // Keep only the most recent connection for each name
        for (const conn of connections) {
            const key = conn.config.name || conn.config.database;
            if (!seen.has(key) || new Date(conn.createdAt) > new Date(seen.get(key)!.createdAt)) {
                seen.set(key, conn);
            }
        }

        const cleaned = Array.from(seen.values());
        if (cleaned.length !== connections.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
            console.log('Cleaned up duplicate connections:', connections.length - cleaned.length, 'removed');
        }
    } catch (error) {
        console.error('Failed to cleanup duplicates:', error);
    }
}

const QUERY_STORAGE_KEY = 'datablaze_saved_queries';

export interface SavedQuery {
    id: string;
    name: string;
    sql: string;
    createdAt: string;
}

export function getSavedQueries(): SavedQuery[] {
    try {
        const data = localStorage.getItem(QUERY_STORAGE_KEY);
        if (data) return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load saved queries:', error);
    }
    return [];
}

export function saveQuery(query: SavedQuery): void {
    try {
        const queries = getSavedQueries();
        const existingIndex = queries.findIndex(q => q.id === query.id);
        if (existingIndex >= 0) {
            queries[existingIndex] = query;
        } else {
            queries.push(query);
        }
        localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(queries));
    } catch (error) {
        console.error('Failed to save query:', error);
    }
}

export function removeSavedQuery(id: string): void {
    try {
        const queries = getSavedQueries();
        const filtered = queries.filter(q => q.id !== id);
        localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Failed to remove saved query:', error);
    }
}

// ============================================
// App State Persistence
// ============================================

const APP_STATE_KEY = 'datablaze_app_state';

export interface SavedTab {
    id: string;
    title: string;
    sql: string;
    type?: 'query' | 'structure';
    tableName?: string;
    connectionName?: string; // Name of the connection this tab was associated with
}

export interface AppState {
    queryTabs: SavedTab[];
    activeTabId: string | null;
    lastActiveConnectionName: string | null;
    lastActiveDatabase: string | null; // The specific database within the connection
    editorHeight: number;
    leftSidebarWidth: number;
    theme: 'dark' | 'light';
    tabCounter: number;
}

const DEFAULT_APP_STATE: AppState = {
    queryTabs: [{ id: 'tab-1', title: 'Query 1', sql: '' }],
    activeTabId: 'tab-1',
    lastActiveConnectionName: null,
    lastActiveDatabase: null,
    editorHeight: 300,
    leftSidebarWidth: 280,
    theme: 'dark',
    tabCounter: 1,
};

export function getAppState(): AppState {
    try {
        const data = localStorage.getItem(APP_STATE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            // Merge with defaults to ensure all fields exist
            return { ...DEFAULT_APP_STATE, ...parsed };
        }
    } catch (error) {
        console.error('Failed to load app state:', error);
    }
    return DEFAULT_APP_STATE;
}

export function saveAppState(state: Partial<AppState>): void {
    try {
        const currentState = getAppState();
        const newState = { ...currentState, ...state };
        localStorage.setItem(APP_STATE_KEY, JSON.stringify(newState));
    } catch (error) {
        console.error('Failed to save app state:', error);
    }
}

export function clearAppState(): void {
    localStorage.removeItem(APP_STATE_KEY);
}

