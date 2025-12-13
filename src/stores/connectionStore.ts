import { create } from 'zustand';
import { Connection, TableInfo, QueryResult, TableStructure } from '../lib/tauri';
import { getSavedConnections, saveConnection, removeSavedConnection, SavedConnection, cleanupDuplicates, getSavedQueries, saveQuery, removeSavedQuery, SavedQuery, getAppState, saveAppState } from '../lib/storage';

interface QueryTab {
    id: string;
    title: string;
    sql: string;
    connectionId: string | null;
    connectionName?: string; // Name of the connection for persistence
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
    tableStructures: Record<string, TableStructure>; // Cache for table column info
    queryTabs: QueryTab[];
    activeTabId: string | null;
    isConnecting: boolean;
    error: string | null;

    // Actions
    loadSavedConnections: () => void;
    loadSavedQueries: () => void;
    loadAppState: () => void;
    persistTabsState: () => void;
    addConnection: (connection: Connection, persist?: boolean, savePassword?: boolean) => void;
    removeConnection: (id: string) => void;
    removeSavedConnectionById: (id: string) => void;
    setActiveConnection: (id: string | null) => void;
    setTables: (tables: TableInfo[]) => void;
    setTableStructure: (tableName: string, structure: TableStructure) => void;
    getTableColumns: (tableName: string) => string[];
    addQueryTab: () => void;
    removeQueryTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    updateTabSql: (id: string, sql: string, tableName?: string) => void;
    updateTabConnection: (id: string, connectionId: string) => void;
    setConnecting: (connecting: boolean) => void;
    setError: (error: string | null) => void;
    addSavedQuery: (name: string, sql: string) => void;
    deleteSavedQuery: (id: string) => void;
    addStructureTab: (tableName: string) => void;
    updateTabResult: (id: string, result: QueryResult | null, isExecuting: boolean, error: string | null) => void;
}

// Load initial tabCounter from saved state
const savedState = getAppState();
let tabCounter = savedState.tabCounter || 1;

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

// Helper to persist tabs state
function saveTabsState(tabs: QueryTab[], activeTabId: string | null, connections: Connection[]) {
    const tabsToSave = tabs.map(t => {
        // Get connection name from the current connection if available
        let connectionName = t.connectionName;
        if (t.connectionId && !connectionName) {
            const conn = connections.find(c => c.id === t.connectionId);
            if (conn) {
                connectionName = conn.config.name;
            }
        }
        return {
            id: t.id,
            title: t.title,
            sql: t.sql,
            type: t.type,
            tableName: t.tableName,
            connectionName,
        };
    });
    saveAppState({
        queryTabs: tabsToSave,
        activeTabId,
        tabCounter,
    });
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
    connections: [],
    savedConnections: [],
    savedQueries: [],
    activeConnectionId: null,
    tables: [],
    tableStructures: {},
    queryTabs: [{ id: 'tab-1', title: 'Query 1', sql: '', connectionId: null }],
    activeTabId: 'tab-1',
    isConnecting: false,
    error: null,

    loadAppState: () => {
        const appState = getAppState();

        // Restore tab counter
        tabCounter = appState.tabCounter || 1;

        // Restore tabs if we have any saved
        if (appState.queryTabs && appState.queryTabs.length > 0) {
            const restoredTabs: QueryTab[] = appState.queryTabs.map(t => ({
                id: t.id,
                title: t.title,
                sql: t.sql,
                connectionId: null,
                connectionName: t.connectionName, // Restore connection name
                type: t.type,
                tableName: t.tableName,
            }));

            set({
                queryTabs: restoredTabs,
                activeTabId: appState.activeTabId || restoredTabs[0]?.id || null,
            });
        }
    },

    persistTabsState: () => {
        const state = get();
        saveTabsState(state.queryTabs, state.activeTabId, state.connections);
    },

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

            // Save last active connection name and database for state persistence
            saveAppState({
                lastActiveConnectionName: connection.config.name,
                lastActiveDatabase: connection.config.database || null
            });

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

    setTableStructure: (tableName, structure) => {
        set((state) => ({
            tableStructures: {
                ...state.tableStructures,
                [tableName.toLowerCase()]: structure,
            },
        }));
    },

    getTableColumns: (tableName) => {
        const state = get();
        const structure = state.tableStructures[tableName.toLowerCase()];
        if (structure && structure.columns) {
            return structure.columns.map(c => c.name);
        }
        return [];
    },

    addQueryTab: () => {
        tabCounter++;
        const newTab: QueryTab = {
            id: `tab-${tabCounter}`,
            title: `Query ${tabCounter}`,
            sql: '',
            connectionId: null,
        };
        set((state) => {
            const newTabs = [...state.queryTabs, newTab];
            // Persist after adding
            setTimeout(() => saveTabsState(newTabs, newTab.id, state.connections), 0);
            return {
                queryTabs: newTabs,
                activeTabId: newTab.id,
            };
        });
    },

    removeQueryTab: (id) =>
        set((state) => {
            let tabs = state.queryTabs.filter((t) => t.id !== id);
            if (tabs.length === 0) {
                tabCounter++;
                tabs.push({ id: `tab-${tabCounter}`, title: `Query ${tabCounter}`, sql: '', connectionId: null });
            }
            const newActiveTabId = state.activeTabId === id ? tabs[tabs.length - 1].id : state.activeTabId;
            // Persist after removing
            setTimeout(() => saveTabsState(tabs, newActiveTabId, state.connections), 0);
            return {
                queryTabs: tabs,
                activeTabId: newActiveTabId,
            };
        }),

    setActiveTab: (id) => {
        set({ activeTabId: id });
        // Persist active tab change
        const state = get();
        setTimeout(() => saveTabsState(state.queryTabs, id, state.connections), 0);
    },

    updateTabSql: (id, sql, tableName?) =>
        set((state) => {
            const newTabs = state.queryTabs.map((t) => {
                if (t.id === id) {
                    // Only update title if it's a generic "Query N" title or if SQL changes significantly
                    const shouldUpdateTitle = t.title.match(/^Query \d+$/) || !t.sql.trim();
                    const newTitle = shouldUpdateTitle ? generateTabTitle(sql) : t.title;
                    return { ...t, sql, title: newTitle, tableName: tableName ?? t.tableName };
                }
                return t;
            });
            // Debounced persist - only persist when SQL has content
            if (sql.trim()) {
                setTimeout(() => saveTabsState(newTabs, state.activeTabId, state.connections), 500);
            }
            return { queryTabs: newTabs };
        }),

    updateTabConnection: (id, connectionId) =>
        set((state) => {
            const conn = state.connections.find(c => c.id === connectionId);
            const connectionName = conn?.config.name;
            const newTabs = state.queryTabs.map((t) =>
                t.id === id ? { ...t, connectionId, connectionName } : t
            );
            // Persist connection association
            setTimeout(() => saveTabsState(newTabs, state.activeTabId, state.connections), 0);
            return { queryTabs: newTabs };
        }),

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
        set((state) => {
            const newTabs = [...state.queryTabs, newTab];
            // Persist after adding
            setTimeout(() => saveTabsState(newTabs, newTab.id, state.connections), 0);
            return {
                queryTabs: newTabs,
                activeTabId: newTab.id,
            };
        });
    },

    updateTabResult: (id, result, isExecuting, error) =>
        set((state) => ({
            queryTabs: state.queryTabs.map((t) =>
                t.id === id ? { ...t, result, isExecuting, error } : t
            ),
        })),
}));

