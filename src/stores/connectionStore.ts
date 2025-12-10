import { create } from 'zustand';
import { Connection, TableInfo } from '../lib/tauri';
import { getSavedConnections, saveConnection, removeSavedConnection, SavedConnection, cleanupDuplicates, getSavedQueries, saveQuery, removeSavedQuery, SavedQuery } from '../lib/storage';

interface QueryTab {
    id: string;
    title: string;
    sql: string;
    connectionId: string | null;
    type?: 'query' | 'structure';
    tableName?: string;
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
}

let tabCounter = 1;

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
            queryTabs: state.queryTabs.map((t) => (t.id === id ? { ...t, sql } : t)),
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
}));
