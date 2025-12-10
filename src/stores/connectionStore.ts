import { create } from 'zustand';
import { Connection, TableInfo, QueryResult } from '../lib/tauri';
import { getSavedConnections, saveConnection, removeSavedConnection, SavedConnection, cleanupDuplicates, getSavedQueries, saveQuery, removeSavedQuery, SavedQuery } from '../lib/storage';

interface QueryTab {
    id: string;
    title: string;
    sql: string;
    connectionId: string | null;
    type?: 'query' | 'structure';
    tableName?: string;
    result?: QueryResult | null;
    isExecuting?: boolean;
    error?: string | null;
}

interface ConnectionState {
    connections: Connection[];
    savedConnections: SavedConnection[];
    savedQueries: SavedQuery[];
    activeConnectionId: string | null;
    tables: TableInfo[];
    queryTabs: QueryTab[];
    activeTabId: string | null;
    isConnecting: boolean;
    error: string | null;

    // Actions
    loadSavedConnections: () => void;
    loadSavedQueries: () => void;
    addConnection: (connection: Connection, persist?: boolean, savePassword?: boolean) => void;
    removeConnection: (id: string) => void;
    removeSavedConnectionById: (id: string) => void;
    setActiveConnection: (id: string | null) => void;
    setTables: (tables: TableInfo[]) => void;
    addQueryTab: () => void;
    removeQueryTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    updateTabSql: (id: string, sql: string) => void;
    updateTabConnection: (id: string, connectionId: string) => void;
    setConnecting: (connecting: boolean) => void;
    setError: (error: string | null) => void;
    addSavedQuery: (name: string, sql: string) => void;
    deleteSavedQuery: (id: string) => void;
    addStructureTab: (tableName: string) => void;
    updateTabResult: (id: string, result: QueryResult | null, isExecuting: boolean, error: string | null) => void;
}

let tabCounter = 1;

// Helper function to generate tab title from SQL
function generateTabTitle(sql: string): string {
    const trimmed = sql.trim().toUpperCase();
    
    if (!trimmed) return `Query ${tabCounter}`;
    
    // SELECT queries
    if (trimmed.startsWith('SELECT')) {
        // Extract table name from "SELECT ... FROM table_name"
        const fromMatch = sql.match(/FROM\s+([\w.]+)/i);
        if (fromMatch) {
            const tableName = fromMatch[1].split('.').pop(); // Handle schema.table
            return `SELECT ${tableName}`;
        }
        return 'SELECT';
    }
    
    // INSERT queries
    if (trimmed.startsWith('INSERT')) {
        const intoMatch = sql.match(/INTO\s+([\w.]+)/i);
        if (intoMatch) {
            const tableName = intoMatch[1].split('.').pop();
            return `INSERT ${tableName}`;
        }
        return 'INSERT';
    }
    
    // UPDATE queries
    if (trimmed.startsWith('UPDATE')) {
        const updateMatch = sql.match(/UPDATE\s+([\w.]+)/i);
        if (updateMatch) {
            const tableName = updateMatch[1].split('.').pop();
            return `UPDATE ${tableName}`;
        }
        return 'UPDATE';
    }
    
    // DELETE queries
    if (trimmed.startsWith('DELETE')) {
        const fromMatch = sql.match(/FROM\s+([\w.]+)/i);
        if (fromMatch) {
            const tableName = fromMatch[1].split('.').pop();
            return `DELETE ${tableName}`;
        }
        return 'DELETE';
    }
    
    // CREATE queries
    if (trimmed.startsWith('CREATE')) {
        if (trimmed.includes('TABLE')) {
            const tableMatch = sql.match(/TABLE\s+([\w.]+)/i);
            if (tableMatch) {
                const tableName = tableMatch[1].split('.').pop();
                return `CREATE ${tableName}`;
            }
            return 'CREATE TABLE';
        }
        return 'CREATE';
    }
    
    // DROP queries
    if (trimmed.startsWith('DROP')) {
        const dropMatch = sql.match(/DROP\s+\w+\s+([\w.]+)/i);
        if (dropMatch) {
            const tableName = dropMatch[1].split('.').pop();
            return `DROP ${tableName}`;
        }
        return 'DROP';
    }
    
    // ALTER queries
    if (trimmed.startsWith('ALTER')) {
        const alterMatch = sql.match(/ALTER\s+\w+\s+([\w.]+)/i);
        if (alterMatch) {
            const tableName = alterMatch[1].split('.').pop();
            return `ALTER ${tableName}`;
        }
        return 'ALTER';
    }
    
    // Default to first word of query
    const firstWord = trimmed.split(/\s+/)[0];
    return firstWord.length > 15 ? firstWord.substring(0, 15) + '...' : firstWord;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
    connections: [],
    savedConnections: [],
    savedQueries: [],
    activeConnectionId: null,
    tables: [],
    queryTabs: [{ id: 'tab-1', title: 'Query 1', sql: '', connectionId: null }],
    activeTabId: 'tab-1',
    isConnecting: false,
    error: null,

    loadSavedConnections: () => {
        cleanupDuplicates(); // Clean duplicates on load
        const saved = getSavedConnections();
        set({ savedConnections: saved });
    },

    loadSavedQueries: () => {
        set({ savedQueries: getSavedQueries() });
    },

    addSavedQuery: (name, sql) => {
        const newQuery: SavedQuery = {
            id: crypto.randomUUID(),
            name,
            sql,
            createdAt: new Date().toISOString()
        };
        saveQuery(newQuery);
        set({ savedQueries: getSavedQueries() });
    },

    deleteSavedQuery: (id) => {
        removeSavedQuery(id);
        set({ savedQueries: getSavedQueries() });
    },

    addConnection: (connection, persist = true, savePassword = true) => {
        // Save to localStorage ONLY if persist is true
        if (persist) {
            saveConnection(connection.id, connection.config, savePassword);
        }

        set((state) => {
            // Prevent duplicates in active connections
            const existingIndex = state.connections.findIndex(c =>
                c.config.name === connection.config.name
            );

            let newConnections;
            if (existingIndex >= 0) {
                // Replace existing
                newConnections = [...state.connections];
                newConnections[existingIndex] = connection;
            } else {
                newConnections = [...state.connections, connection];
            }

            return {
                connections: newConnections,
                // Only reload saved connections if we actually saved/persisted something or if we want to ensure sync
                // However, reload only if persisted to avoid showing temporary connections as saved
                savedConnections: persist ? getSavedConnections() : state.savedConnections,
                activeConnectionId: connection.id,
            };
        });
    },

    removeConnection: (id) => {
        set((state) => ({
            connections: state.connections.filter((c) => c.id !== id),
            activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
            tables: state.activeConnectionId === id ? [] : state.tables,
        }));
    },

    removeSavedConnectionById: (id) => {
        removeSavedConnection(id);
        set({ savedConnections: getSavedConnections() });
    },

    setActiveConnection: (id) => set({ activeConnectionId: id }),

    setTables: (tables) => set({ tables }),

    addQueryTab: () => {
        tabCounter++;
        const newTab: QueryTab = {
            id: `tab-${tabCounter}`,
            title: `Query ${tabCounter}`,
            sql: '',
            connectionId: null,
        };
        set((state) => ({
            queryTabs: [...state.queryTabs, newTab],
            activeTabId: newTab.id,
        }));
    },

    removeQueryTab: (id) =>
        set((state) => {
            const tabs = state.queryTabs.filter((t) => t.id !== id);
            if (tabs.length === 0) {
                tabCounter++;
                tabs.push({ id: `tab-${tabCounter}`, title: `Query ${tabCounter}`, sql: '', connectionId: null });
            }
            return {
                queryTabs: tabs,
                activeTabId: state.activeTabId === id ? tabs[tabs.length - 1].id : state.activeTabId,
            };
        }),

    setActiveTab: (id) => set({ activeTabId: id }),

    updateTabSql: (id, sql) =>
        set((state) => ({
            queryTabs: state.queryTabs.map((t) => {
                if (t.id === id) {
                    // Only update title if it's a generic "Query N" title or if SQL changes significantly
                    const shouldUpdateTitle = t.title.match(/^Query \d+$/) || !t.sql.trim();
                    const newTitle = shouldUpdateTitle ? generateTabTitle(sql) : t.title;
                    return { ...t, sql, title: newTitle };
                }
                return t;
            }),
        })),

    updateTabConnection: (id, connectionId) =>
        set((state) => ({
            queryTabs: state.queryTabs.map((t) => (t.id === id ? { ...t, connectionId } : t)),
        })),

    setConnecting: (connecting) => set({ isConnecting: connecting }),

    setError: (error) => set({ error }),

    addStructureTab: (tableName) => {
        tabCounter++;
        const newTab: QueryTab = {
            id: `tab-${tabCounter}`,
            title: `Structure: ${tableName}`,
            sql: '',
            connectionId: null,
            type: 'structure',
            tableName
        };
        set((state) => ({
            queryTabs: [...state.queryTabs, newTab],
            activeTabId: newTab.id,
        }));
    },

    updateTabResult: (id, result, isExecuting, error) =>
        set((state) => ({
            queryTabs: state.queryTabs.map((t) => 
                t.id === id ? { ...t, result, isExecuting, error } : t
            ),
        })),
}));
