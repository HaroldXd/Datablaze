import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Database, Grid, Layers, RefreshCw, Power, Trash2, Download, Copy, Unplug, Table as TableIcon, Hash, Key } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { getTables, disconnectDatabase, connectDatabase, listDatabases, executeQuery, getTableStructure } from '../../lib/tauri';
import { SavedConnection } from '../../lib/storage';
import { Modal } from '../UI/Modal';

interface DatabaseTreeProps {
    onTableDataRequest: (table: string) => void;
    filter: string;
    sortOrder?: 'asc' | 'desc';
}

export const DatabaseTree: React.FC<DatabaseTreeProps> = ({ onTableDataRequest, filter, sortOrder = 'asc' }) => {
    const {
        connections,
        savedConnections,
        activeConnectionId,
        tables,
        setActiveConnection,
        setTables,
        removeConnection,
        removeSavedConnectionById,
        addConnection,
        addStructureTab,
        addQueryTab,
        updateTabSql
    } = useConnectionStore();

    const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
    const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
    const [reconnecting, setReconnecting] = useState<string | null>(null);
    const [editModal, setEditModal] = useState<SavedConnection | null>(null);
    const [editPassword, setEditPassword] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; table: string } | null>(null);
    const [availableDatabases, setAvailableDatabases] = useState<string[]>([]);
    const [loadingDatabases, setLoadingDatabases] = useState(false);
    const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
    const [databaseListError, setDatabaseListError] = useState<string | null>(null);

    // Modal States
    const [confirmationModal, setConfirmationModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const [alertModal, setAlertModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
    }>({ isOpen: false, title: '', message: '' });


    // Table Structure Expansion State
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [tableStructures, setTableStructures] = useState<Record<string, any>>({});
    const [loadingTableStructure, setLoadingTableStructure] = useState<string | null>(null);

    const prevActiveConnectionIdRef = React.useRef<string | null>(null);

    // Sync expandedDatabases with active connection ONLY when it changes
    useEffect(() => {
        if (activeConnectionId && activeConnectionId !== prevActiveConnectionIdRef.current) {
            const activeConn = connections.find(c => c.id === activeConnectionId);
            if (activeConn?.config.database) {
                setExpandedDatabases(prev => new Set(prev).add(activeConn.config.database!));
            }
        }
        prevActiveConnectionIdRef.current = activeConnectionId;
    }, [activeConnectionId, connections]);

    // ... (existing code)

    // Connect to a specific database from the list
    const handleSelectDatabase = async (dbName: string) => {
        if (!activeConnectionId) return;

        const activeConn = connections.find(c => c.id === activeConnectionId);
        if (!activeConn) return;

        // If already connected to this database, just ensure it's expanded
        if (activeConn.config.database === dbName) {
            setExpandedDatabases(prev => new Set(prev).add(dbName));
            return;
        }

        const oldConnectionId = activeConnectionId;

        // Find root saved connection to get clean name
        const rootSaved = savedConnections.find(s =>
            s.config.host === activeConn.config.host &&
            s.config.port === activeConn.config.port
        );
        const baseName = rootSaved ? (rootSaved.config.name || 'Server') : 'Server';

        // Create a new connection config with the selected database
        const newConfig = {
            ...activeConn.config,
            database: dbName,
            name: `${baseName} / ${dbName}`
        };

        // UI Optimistic Update: Set loading state but don't clear tables yet if possible,
        // or clear them only for the new view.
        // Actually, we want to look fast.
        setLoadingDatabases(true);

        try {
            // Strings: Connect NEW first (Overlap method) to prevent UI flicker (No disconnected state)
            const connection = await connectDatabase(newConfig);

            // 1. Add new connection to store
            addConnection(connection, false);

            // 2. Switch Active ID immediately (The atomic switch)
            // This prevents the UI from rendering "nothing selected" or "disconnected"
            // The old connection is still in the store but not active.
            setActiveConnection(connection.id);

            // 3. Cleanup Old Connection
            try {
                await disconnectDatabase(oldConnectionId);
                removeConnection(oldConnectionId);
            } catch (cleanupErr) {
                console.warn('Failed to clean up old connection:', cleanupErr);
                // Non-fatal, just log
            }

            // 4. Load Data for new connection
            // We can do this in parallel or sequence
            const fetchedTables = await getTables(connection.id);
            setTables(fetchedTables);

            // Reload database list just in case (optional, but good for consistency)
            // We can pass the new ID to ensure it loads for the correct context
            loadDatabases(connection.id);

            // Ensure the new DB node is expanded
            setExpandedDatabases(prev => new Set(prev).add(dbName));

        } catch (err) {
            console.error('Failed to connect to database:', err);
            setAlertModal({
                isOpen: true,
                title: 'Connection Failed',
                message: 'Failed to connect to database: ' + err
            });
            // If failed, we are still on the old connection, so no UI state triggers needed.
        } finally {
            setLoadingDatabases(false);
        }
    };

    const toggleDatabaseExpansion = (dbName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        console.log('[DatabaseTree] Toggling expansion for:', dbName);
        console.log('[DatabaseTree] Current expanded set:', Array.from(expandedDatabases));

        const isExpanded = expandedDatabases.has(dbName);
        console.log('[DatabaseTree] Is currently expanded?', isExpanded);

        if (isExpanded) {
            // Collapse
            const newExpanded = new Set(expandedDatabases);
            newExpanded.delete(dbName);
            setExpandedDatabases(newExpanded);
            console.log('[DatabaseTree] Collapsing. New state size:', newExpanded.size);
        } else {
            // Expand -> Must Activate/Connect
            console.log('[DatabaseTree] Expanding -> Triggering handleSelectDatabase');
            handleSelectDatabase(dbName);
        }
    }

    // ... (existing code)



    const loadDatabases = async (id: string) => {
        setLoadingDatabases(true);
        setDatabaseListError(null);
        try {
            const dbs = await listDatabases(id);
            setAvailableDatabases(dbs);
        } catch (err) {
            console.error('Failed to load databases:', err);
            setDatabaseListError(String(err));
        } finally {
            setLoadingDatabases(false);
        }
    };

    // Load available databases when connection is made without specific database
    useEffect(() => {
        if (activeConnectionId) {
            const activeConn = connections.find(c => c.id === activeConnectionId);
            // If connected without specific database, load database list
            if (activeConn && !activeConn.config.database) {
                loadDatabases(activeConnectionId);
            }
        }
    }, [activeConnectionId, connections]);

    const toggleConnection = async (id: string) => {
        // Find if this ID corresponds to an active active connection
        // But 'id' here is the SAVED connection ID (from the tree loop)
        // Check if we are currently connected to this saved connection
        const savedConn = savedConnections.find(s => s.id === id);
        if (!savedConn) return;

        const activeConn = connections.find(c => c.id === activeConnectionId);
        const isConnected = activeConn &&
            activeConn.config.host === savedConn.config.host &&
            activeConn.config.port === savedConn.config.port;

        const newExpanded = new Set(expandedConnections);

        if (isConnected) {
            // If already connected/active, just toggle expansion
            if (newExpanded.has(id)) {
                newExpanded.delete(id);
            } else {
                newExpanded.add(id);
            }
            setExpandedConnections(newExpanded);
        } else {
            // Not connected? Connect automatically!
            // Delegate to handleReconnect logic
            // We pass a mock event or handle logic manually
            if (savedConn.config.password) {
                // Auto-connect with saved password
                setReconnecting(savedConn.id);
                try {
                    const connection = await connectDatabase(savedConn.config);
                    // Add as active, but don't need to re-persist if it's just a reconnect
                    addConnection(connection, false);

                    newExpanded.add(id); // Use the SAVED id for expansion tracking
                    setExpandedConnections(newExpanded);
                    setActiveConnection(connection.id);

                    const fetchedTables = await getTables(connection.id);
                    setTables(fetchedTables);
                } catch (err) {
                    console.error('Failed to auto-connect:', err);
                    setAlertModal({
                        isOpen: true,
                        title: 'Connection Failed',
                        message: 'Failed to connect: ' + err
                    });
                } finally {
                    setReconnecting(null);
                }
            } else {
                // Need password - open modal
                setEditModal(savedConn);
                setEditPassword('');
                // Expansion happens after password success
            }
        }
    };

    const toggleSchema = (schema: string) => {
        const newExpanded = new Set(expandedSchemas);
        if (newExpanded.has(schema)) {
            newExpanded.delete(schema);
        } else {
            newExpanded.add(schema);
        }
        setExpandedSchemas(newExpanded);
    };



    const handleDisconnect = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await disconnectDatabase(id);
            removeConnection(id);
        } catch (err) {
            console.error('Failed to disconnect:', err);
        }
    };

    const handleReconnect = async (saved: SavedConnection, e: React.MouseEvent) => {
        e.stopPropagation();
        if (saved.config.password) {
            setReconnecting(saved.id);
            try {
                const connection = await connectDatabase(saved.config);
                addConnection(connection, true);

                const newExpanded = new Set(expandedConnections);
                newExpanded.add(connection.id);
                setExpandedConnections(newExpanded);

                const fetchedTables = await getTables(connection.id);
                setTables(fetchedTables);
            } catch (err) {
                console.error('Failed to reconnect:', err);
                setAlertModal({
                    isOpen: true,
                    title: 'Connection Failed',
                    message: 'Failed to reconnect: ' + err
                });
            } finally {
                setReconnecting(null);
            }
        } else {
            setEditModal(saved);
            setEditPassword('');
        }
    };

    const handleReconnectWithPassword = async () => {
        if (!editModal) return;
        setReconnecting(editModal.id);
        try {
            const config = { ...editModal.config, password: editPassword };
            const connection = await connectDatabase(config);
            addConnection(connection, true);

            const newExpanded = new Set(expandedConnections);
            newExpanded.add(connection.id);
            setExpandedConnections(newExpanded);

            const fetchedTables = await getTables(connection.id);
            setTables(fetchedTables);
            setEditModal(null);
        } catch (err) {
            console.error('Failed to reconnect:', err);
            setAlertModal({
                isOpen: true,
                title: 'Connection Failed',
                message: 'Failed to reconnect: ' + err
            });
        } finally {
            setReconnecting(null);
        }
    };

    const handleDeleteSaved = (saved: SavedConnection, e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmationModal({
            isOpen: true,
            title: 'Delete Connection',
            message: `Delete saved connection "${saved.config.name || saved.config.database}"?`,
            onConfirm: () => removeSavedConnectionById(saved.id)
        });
    };

    const handleTableClick = (table: string) => {
        onTableDataRequest(table);
    };

    const handleContextMenu = (e: React.MouseEvent, table: string) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event('close-context-menus'));
        setContextMenu({ x: e.clientX, y: e.clientY, table });
    };

    const closeContextMenu = () => setContextMenu(null);

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClickOutside);
            window.addEventListener('close-context-menus', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
            window.removeEventListener('close-context-menus', handleClickOutside);
        };
    }, [contextMenu]);

    const handleExportTable = async (format: 'csv' | 'json') => {
        if (!contextMenu) return;
        console.log(`Export ${contextMenu.table} as ${format}`);
        closeContextMenu();
    };

    const handleCopyTableName = () => {
        if (!contextMenu) return;
        navigator.clipboard.writeText(contextMenu.table);
        closeContextMenu();
    };

    const handleViewStructure = () => {
        if (!contextMenu || !activeConnectionId) return;
        addStructureTab(contextMenu.table);
        closeContextMenu();
    };

    const handleSelectTop100 = () => {
        if (!contextMenu || !activeConnectionId) return;
        const sql = `SELECT * FROM ${contextMenu.table} LIMIT 100;`;
        addQueryTab();
        setTimeout(() => {
            const tabs = useConnectionStore.getState().queryTabs;
            const latestTab = tabs[tabs.length - 1];
            if (latestTab) {
                updateTabSql(latestTab.id, sql);
            }
        }, 50);
        closeContextMenu();
    };

    const handleCountRows = async () => {
        if (!contextMenu || !activeConnectionId) return;
        const sql = `SELECT COUNT(*) as row_count FROM ${contextMenu.table};`;
        addQueryTab();
        setTimeout(() => {
            const tabs = useConnectionStore.getState().queryTabs;
            const latestTab = tabs[tabs.length - 1];
            if (latestTab) {
                updateTabSql(latestTab.id, sql);
            }
        }, 50);
        closeContextMenu();
    };

    const handleDropTable = async () => {
        if (!contextMenu || !activeConnectionId) return;
        const tableName = contextMenu.table;
        const connectionId = activeConnectionId; // Capture for closure

        setConfirmationModal({
            isOpen: true,
            title: 'Drop Table',
            message: `Are you sure you want to DROP table "${tableName}"? This cannot be undone.`,
            onConfirm: async () => {
                try {
                    await executeQuery(connectionId, `DROP TABLE ${tableName}`);
                    const fetchedTables = await getTables(connectionId);
                    setTables(fetchedTables);
                    setAlertModal({
                        isOpen: true,
                        title: 'Success',
                        message: `Table ${tableName} dropped.`
                    });
                } catch (err) {
                    setAlertModal({
                        isOpen: true,
                        title: 'Error',
                        message: 'Failed to drop table: ' + err
                    });
                }
            }
        });
        closeContextMenu();
    };

    const toggleTableExpansion = async (tableName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedTables);
        if (newExpanded.has(tableName)) {
            newExpanded.delete(tableName);
            setExpandedTables(newExpanded);
        } else {
            newExpanded.add(tableName);
            setExpandedTables(newExpanded);

            // Only fetch if not already cached
            if (!tableStructures[tableName] && activeConnectionId) {
                setLoadingTableStructure(tableName);
                try {
                    const structure = await getTableStructure(activeConnectionId, tableName);
                    setTableStructures(prev => ({ ...prev, [tableName]: structure }));
                } catch (err) {
                    console.error('Failed to load table structure', err);
                } finally {
                    setLoadingTableStructure(null);
                }
            }
        }
    };

    const renderTableColumns = (tableName: string) => {
        if (!expandedTables.has(tableName)) return null;
        if (loadingTableStructure === tableName) {
            return <div style={{ paddingLeft: '28px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading columns...</div>;
        }
        const structure = tableStructures[tableName];
        if (!structure || !structure.columns) return null;

        return (
            <div style={{ marginLeft: '12px', borderLeft: '1px solid var(--border-color)' }}>
                {structure.columns.map((col: any, idx: number) => (
                    <div key={idx} style={{
                        padding: '4px 0 4px 16px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        {col.is_primary_key ?
                            <div style={{ color: 'var(--warning)', transform: 'scale(0.8)' }}><Key size={12} /></div> :
                            <div style={{ width: 12 }} />
                        }
                        <span style={{ color: col.is_primary_key ? 'var(--text-primary)' : 'inherit', fontFamily: 'monospace' }}>{col.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: 'auto', paddingRight: '8px' }}>{col.data_type}</span>
                    </div>
                ))}
            </div>
        );
    };

    const filteredTables = tables.filter(table =>
        table.name.toLowerCase().includes(filter.toLowerCase())
    );

    const sortedTables = [...filteredTables].sort((a, b) => {
        const comparison = a.name.localeCompare(b.name);
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const tablesBySchema = sortedTables.reduce((acc, table) => {
        const schema = table.schema || 'public';
        if (!acc[schema]) {
            acc[schema] = [];
        }
        acc[schema].push(table);
        return acc;
    }, {} as Record<string, typeof tables>);

    // Render Logic for Databases Folder
    const renderDatabasesFolder = (activeDbName: string | undefined) => {
        return (
            <div className="tree-node-children">
                {(loadingDatabases || availableDatabases.length > 0) && (
                    <div className="tree-node">
                        <div
                            className="tree-node-content"
                            style={{ paddingLeft: '32px' }}
                        >
                            <div className="node-toggle" style={{ opacity: 0 }}></div>
                            <Database size={14} className="node-icon" color="var(--text-muted)" />
                            <span className="node-label">Databases ({availableDatabases.length})</span>
                        </div>
                        <div className="tree-node-children">
                            {loadingDatabases && <div style={{ paddingLeft: '48px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</div>}
                            {databaseListError && (
                                <div style={{ paddingLeft: '48px', fontSize: '11px', color: 'var(--error)' }}>
                                    {databaseListError}
                                </div>
                            )}
                            {availableDatabases.map(db => {
                                const isActive = activeDbName === db;
                                const isExpanded = expandedDatabases.has(db);
                                // If active, it is effectively "expanded" in terms of connection
                                // But let's clarify the UI: Clicking row -> Selects & Expands.
                                return (
                                    <div key={db}>
                                        <div
                                            className={`tree-node-content ${isActive ? 'active' : ''}`}
                                            style={{ paddingLeft: '32px', cursor: 'pointer' }}
                                            onClick={() => handleSelectDatabase(db)}
                                        >
                                            {/* Dropdown Toggle */}
                                            <div
                                                className="node-toggle"
                                                onClick={(e) => toggleDatabaseExpansion(db, e)}
                                            >
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </div>

                                            <Database size={14} className="node-icon" color={isActive ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                                            <span className="node-label" style={{ color: isActive ? 'var(--accent-primary)' : 'inherit' }}>
                                                {db}
                                            </span>
                                            {isActive && <div className="active-indicator" />}
                                        </div>

                                        {/* If Active, Show Schemas/Tables HERE */}
                                        {isExpanded && (
                                            <div className="tree-node-children">
                                                {Object.keys(tablesBySchema).length === 0 ? (
                                                    <div style={{ padding: '8px 16px', paddingLeft: '64px', color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' }}>
                                                        {loadingTableStructure ? 'Loading tables...' : 'No tables found'}
                                                    </div>
                                                ) : (
                                                    Object.entries(tablesBySchema).map(([schema, schemaTables]) => (
                                                        <div key={schema}>
                                                            <div
                                                                className="tree-node-content"
                                                                onClick={() => toggleSchema(schema)}
                                                                style={{ paddingLeft: '64px' }}
                                                            >
                                                                <div className="node-toggle" style={{ transform: 'scale(0.8)' }}>
                                                                    {expandedSchemas.has(schema) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                </div>
                                                                <Layers size={14} className="node-icon" color="var(--text-muted)" />
                                                                <span className="node-label">{schema}</span>
                                                            </div>

                                                            {expandedSchemas.has(schema) && (
                                                                <div className="tree-node-children">
                                                                    {schemaTables.map((table) => (
                                                                        <div key={table.name} className="tree-node">
                                                                            <div
                                                                                className="tree-node-content"
                                                                                onClick={() => handleTableClick(table.name)}
                                                                                onContextMenu={(e) => handleContextMenu(e, table.name)}
                                                                                style={{ paddingLeft: '80px' }}
                                                                            >
                                                                                <div
                                                                                    className="node-toggle"
                                                                                    onClick={(e) => toggleTableExpansion(table.name, e)}
                                                                                    style={{ opacity: 0.5, transform: 'scale(0.8)' }}
                                                                                >
                                                                                    {expandedTables.has(table.name) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                                                </div>
                                                                                <TableIcon size={14} className="node-icon" />
                                                                                <span className="node-label" title={table.name}>{table.name}</span>
                                                                            </div>
                                                                            {/* Table Structure (Columns) */}
                                                                            <div style={{ paddingLeft: '80px' }}>
                                                                                {renderTableColumns(table.name)}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="database-tree-container" onClick={closeContextMenu}>
            <div className="database-tree-list">
                {contextMenu && (
                    <div
                        className="context-menu"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="context-menu-header">
                            <TableIcon size={14} />
                            <span>{contextMenu.table}</span>
                        </div>
                        <div className="context-menu-divider" />
                        <div className="context-menu-item" onClick={handleViewStructure}>
                            <Layers size={14} />
                            <span>View Structure</span>
                        </div>
                        <div className="context-menu-item" onClick={handleSelectTop100}>
                            <Grid size={14} />
                            <span>Select Top 100</span>
                        </div>
                        <div className="context-menu-item" onClick={handleCountRows}>
                            <Hash size={14} />
                            <span>Count Rows</span>
                        </div>
                        <div className="context-menu-divider" />
                        <div className="context-menu-item" onClick={handleCopyTableName}>
                            <Copy size={14} />
                            <span>Copy Table Name</span>
                        </div>
                        <div className="context-menu-item" onClick={() => handleExportTable('csv')}>
                            <Download size={14} />
                            <span>Export as CSV</span>
                        </div>
                        <div className="context-menu-item" onClick={() => handleExportTable('json')}>
                            <Download size={14} />
                            <span>Export as JSON</span>
                        </div>
                        <div className="context-menu-divider" />
                        <div className="context-menu-item danger" onClick={handleDropTable} style={{ color: 'var(--error)' }}>
                            <Trash2 size={14} />
                            <span>Drop Table</span>
                        </div>
                    </div>
                )}

                {/* Render Saved Connections as the Root Nodes */}
                {savedConnections.map(conn => {
                    const activeConn = connections.find(c => c.id === activeConnectionId);
                    const isRelated = activeConn &&
                        activeConn.config.host === conn.config.host &&
                        activeConn.config.port === conn.config.port;

                    const isNodeActive = isRelated;

                    return (
                        <div key={conn.id} className="tree-node">
                            <div
                                className={`tree-node-content ${isNodeActive ? 'active' : ''}`}
                                onClick={() => toggleConnection(conn.id)}
                            >
                                <div className="node-toggle">
                                    {expandedConnections.has(conn.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                                <div className="node-icon-wrapper">
                                    {reconnecting === conn.id ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <div className="db-logo small">
                                            {conn.config.db_type === 'PostgreSQL' ? 'PG' : 'MY'}
                                        </div>
                                    )}
                                </div>
                                <span className="node-label">
                                    {conn.config.name || conn.config.host}
                                </span>
                                <div className="node-actions">
                                    {activeConnectionId === conn.id && (
                                        <button
                                            className="node-action-btn"
                                            title="Disconnect"
                                            onClick={(e) => handleDisconnect(conn.id, e)}
                                        >
                                            <Unplug size={12} />
                                        </button>
                                    )}
                                    <button
                                        className="node-action-btn"
                                        title="Connect"
                                        onClick={(e) => handleReconnect(conn, e)}
                                    >
                                        <Power size={12} color={isNodeActive ? 'var(--success)' : 'currentColor'} />
                                    </button>
                                    <button
                                        className="node-action-btn"
                                        title="Forget"
                                        onClick={(e) => handleDeleteSaved(conn, e)}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>

                            {/* Children: Databases + Active Connection Content */}
                            {expandedConnections.has(conn.id) && (
                                <div className="tree-node-children">
                                    {isRelated && renderDatabasesFolder(activeConn?.config.database)}
                                </div>
                            )}
                        </div>
                    );
                })}

                {connections.length === 0 && savedConnections.length === 0 && (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Database size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                        <p style={{ fontSize: '13px' }}>No connections</p>
                        <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>Add a new connection to get started</p>
                    </div>
                )}
            </div>

            {/* Editing Password Modal */}
            {editModal && (
                <Modal
                    isOpen={!!editModal}
                    onClose={() => setEditModal(null)}
                    title="Enter Password"
                    footer={
                        <>
                            <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleReconnectWithPassword}>Connect</button>
                        </>
                    }
                >
                    <p style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        Enter password for <strong>{editModal.config.name || editModal.config.database}</strong>
                    </p>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleReconnectWithPassword()}
                            autoFocus
                        />
                    </div>
                </Modal>
            )}

            {/* Confirmation Modal */}
            <Modal
                isOpen={confirmationModal.isOpen}
                onClose={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
                title={confirmationModal.title}
                footer={
                    <>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setConfirmationModal({ ...confirmationModal, isOpen: false })}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-danger"
                            onClick={() => {
                                confirmationModal.onConfirm();
                                setConfirmationModal({ ...confirmationModal, isOpen: false });
                            }}
                        >
                            Confirm
                        </button>
                    </>
                }
            >
                <div>{confirmationModal.message}</div>
            </Modal>

            {/* Alert Modal */}
            <Modal
                isOpen={alertModal.isOpen}
                onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
                title={alertModal.title}
                footer={
                    <button
                        className="btn btn-primary"
                        onClick={() => setAlertModal({ ...alertModal, isOpen: false })}
                    >
                        OK
                    </button>
                }
            >
                <div>{alertModal.message}</div>
            </Modal>
        </div>
    );
};
