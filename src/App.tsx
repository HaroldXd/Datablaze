import { useState, useEffect, useRef } from 'react';
import {
    Database,
    Plus,
    Play,
    X,
    Settings,
    Moon,
    Sun,
    FileCode,
    Clock,
    Search,
    RefreshCw,
    HelpCircle,
    ChevronDown,
    Command,
    Save,
    ArrowUpDown
} from 'lucide-react';
import { useConnectionStore } from './stores/connectionStore';
import { executeQuery, getTableData, getTables, connectDatabase } from './lib/tauri';
import { QueryResult } from './lib/tauri';
import { SettingsManager } from './lib/settingsManager';
import { SavedConnection } from './lib/storage';

import { Modal } from './components/UI/Modal';
import { ConnectionForm } from './components/Connection/ConnectionForm';
import { DatabaseTree } from './components/Explorer/DatabaseTree';
import { SqlEditor } from './components/Editor/SqlEditor';
import { ResultsPanel } from './components/Results/ResultsPanel';
import { SettingsModal } from './components/Settings/SettingsModal';
import { SavedQueriesModal } from './components/SavedQueries/SavedQueriesModal';
import { ManageConnectionsModal } from './components/Connection/ManageConnectionsModal';
import { StructureView } from './components/Structure/StructureView';
import { TitleBar } from './components/UI/TitleBar';

import './index.css';


interface FkViewContext {
    id: string;
    tableName: string;
    fkValue: any;
    result: QueryResult | null;
    loading: boolean;
    error: string | null;
}

function App() {
    const {
        connections,
        savedConnections,
        activeConnectionId,
        setActiveConnection,
        addConnection,
        queryTabs,
        activeTabId,
        addQueryTab,
        removeQueryTab,
        setActiveTab,
        updateTabSql,
        loadSavedConnections,
        tables,
        setTables,
        savedQueries,
        loadSavedQueries,
        addSavedQuery,
        deleteSavedQuery,
    } = useConnectionStore();

    const [showConnectionModal, setShowConnectionModal] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editorHeight, setEditorHeight] = useState(300);
    const [leftSidebarWidth, setLeftSidebarWidth] = useState(280);
    const [tableFilter, setTableFilter] = useState('');

    // FK Sidebar state
    // FK Sidebar state
    const [fkStack, setFkStack] = useState<FkViewContext[]>([]);
    const [sidebarWidth, setSidebarWidth] = useState(350);
    const latestFkRequestId = useRef<string | null>(null);

    // Settings state
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showConnectionDropdown, setShowConnectionDropdown] = useState(false);
    const [showSavedQueriesModal, setShowSavedQueriesModal] = useState(false);
    const [showSaveQueryDialog, setShowSaveQueryDialog] = useState(false);
    const [saveQueryName, setSaveQueryName] = useState('');
    const [settings, setSettings] = useState(SettingsManager.getSettings());
    const [showManageConnectionsModal, setShowManageConnectionsModal] = useState(false);

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        confirmText?: string;
        cancelText?: string;
        variant?: 'danger' | 'warning' | 'info';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    // Load saved connections on startup
    useEffect(() => {
        loadSavedConnections();
    }, [loadSavedConnections]);

    // Load saved queries on startup
    useEffect(() => {
        loadSavedQueries();
    }, [loadSavedQueries]);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleRefreshSchema = async () => {
        if (!activeConnectionId || isRefreshing) return;
        setIsRefreshing(true);
        try {
            const fetchedTables = await getTables(activeConnectionId);
            setTables(fetchedTables);
        } catch (err) {
            console.error('Failed to refresh schema:', err);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleAddTable = () => {
        if (!activeConnectionId) {
            setConfirmDialog({
                isOpen: true,
                title: 'No Connection',
                message: 'Please connect to a database first before creating a table.',
                confirmText: 'OK',
                variant: 'info',
                onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        // Generate CREATE TABLE statement template
        const sql = `-- Create a new table
CREATE TABLE new_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`;
        // Add new tab with the SQL
        addQueryTab();
        // Get the latest tab and update its SQL
        setTimeout(() => {
            const tabs = useConnectionStore.getState().queryTabs;
            const latestTab = tabs[tabs.length - 1];
            if (latestTab) {
                updateTabSql(latestTab.id, sql);
            }
        }, 100);
    };

    const handleToggleSortOrder = () => {
        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    };

    // Close tab with confirmation if it has content
    const handleCloseTab = (tab: { id: string; sql: string; title: string }) => {
        if (tab.sql.trim()) {
            setConfirmDialog({
                isOpen: true,
                title: 'Close Tab',
                message: `The tab "${tab.title}" has unsaved content. Are you sure you want to close it?`,
                confirmText: 'Close',
                cancelText: 'Cancel',
                variant: 'warning',
                onConfirm: () => {
                    removeQueryTab(tab.id);
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                },
            });
            return;
        }
        removeQueryTab(tab.id);
    };

    // Connect directly to a saved connection
    const handleConnectSaved = async (saved: SavedConnection) => {
        try {
            const connection = await connectDatabase(saved.config);
            addConnection(connection, true);
            const fetchedTables = await getTables(connection.id);
            setTables(fetchedTables);
            setActiveConnection(connection.id);
        } catch (err) {
            console.error('Failed to connect:', err);
            // If connection fails (e.g., password not saved), open manage modal
            setShowManageConnectionsModal(true);
        }
    };

    // Load settings on startup
    useEffect(() => {
        const loaded = SettingsManager.getSettings();
        console.log('[App] Loading settings:', loaded);
        setSettings(loaded);
        setIsDarkMode(loaded.theme === 'dark');
    }, []);

    // Save settings when they change
    useEffect(() => {
        SettingsManager.saveSettings(settings);
        if (settings.theme === 'dark') {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
        } else {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
        }
    }, [settings]);

    // Disable ALL browser behaviors for desktop app experience
    useEffect(() => {
        // Block browser keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // Block refresh: F5, Ctrl+R, Ctrl+Shift+R
            if (
                e.key === 'F5' ||
                (e.ctrlKey && e.key === 'r') ||
                (e.ctrlKey && e.shiftKey && e.key === 'R')
            ) {
                e.preventDefault();
                return false;
            }

            // Block close tab: Ctrl+W
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                return false;
            }

            // Block browser find: Ctrl+F (we can implement our own)
            if (e.ctrlKey && e.key === 'f' && !e.shiftKey) {
                e.preventDefault();
                return false;
            }

            // Block browser print: Ctrl+P
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                return false;
            }

            // Block browser save: Ctrl+S (we handle this ourselves)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                return false;
            }

            // Block browser history navigation: Alt+Left, Alt+Right
            if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                return false;
            }

            // Block DevTools: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                (e.ctrlKey && e.shiftKey && e.key === 'J') ||
                (e.ctrlKey && e.shiftKey && e.key === 'C')
            ) {
                e.preventDefault();
                return false;
            }

            // Block view source: Ctrl+U
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                return false;
            }

            // Block zoom: Ctrl+Plus, Ctrl+Minus, Ctrl+0
            if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
                e.preventDefault();
                return false;
            }

            // Block browser bookmarks: Ctrl+D
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                return false;
            }
        };

        // Block native context menu (right-click) globally - ALWAYS
        // Our React components handle their own context menus via onContextMenu
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };

        // Block drag start on most elements
        const handleDragStart = (e: DragEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG' || target.tagName === 'A') {
                e.preventDefault();
                return false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('dragstart', handleDragStart);

        // Add contextmenu listener - let it bubble so React can handle first
        // The listener is added in bubble phase (default), but we prevent default
        // Our React onContextMenu handlers call e.preventDefault() themselves
        window.addEventListener('contextmenu', handleContextMenu);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('dragstart', handleDragStart);
        };
    }, []);

    const activeTab = queryTabs.find((t) => t.id === activeTabId);

    const closeFkSidebar = () => {
        setFkStack([]);
    };

    const handleFkBack = () => {
        setFkStack(prev => prev.slice(0, -1));
    };

    const handleExecute = async () => {
        if (!activeConnectionId || !activeTab?.sql?.trim()) {
            setError('Please connect to a database and enter a query');
            return;
        }

        setIsExecuting(true);
        setError(null);
        closeFkSidebar();

        try {
            const queryResult = await executeQuery(activeConnectionId, activeTab.sql);
            setResult(queryResult);
        } catch (err) {
            setError(String(err));
            setResult(null);
        } finally {
            setIsExecuting(false);
        }
    };

    const handleTableDataRequest = async (table: string) => {
        if (!activeConnectionId) return;

        const sql = `SELECT * FROM ${table} LIMIT ${settings.defaultRowLimit};`;
        if (activeTab) {
            updateTabSql(activeTab.id, sql);
        }

        console.log('[Frontend] Starting table data request:', table);
        setIsExecuting(true);
        setError(null);
        closeFkSidebar();

        try {
            const queryResult = await getTableData(activeConnectionId, table, settings.defaultRowLimit);
            setResult(queryResult);
        } catch (err) {
            console.error('[Frontend] Error:', err);
            setError(String(err));
            setResult(null);
        } finally {
            setIsExecuting(false);
        }
    };

    const resolveTableName = (guessedTable: string): string | null => {
        if (!tables || tables.length === 0) return guessedTable;
        const tableNames = tables.map(t => t.name.toLowerCase());
        const guess = guessedTable.toLowerCase();
        if (tableNames.includes(guess)) return guess;

        let singular = guess;
        if (guess.endsWith('ies')) singular = guess.slice(0, -3) + 'y';
        else if (guess.endsWith('es')) singular = guess.slice(0, -2);
        else if (guess.endsWith('s')) singular = guess.slice(0, -1);

        if (singular !== guess && tableNames.includes(singular)) return singular;

        const endsWithMatch = tableNames.find(t => t.endsWith('_' + guess) || t.endsWith(guess));
        if (endsWithMatch) return endsWithMatch;

        const endsWithSingular = tableNames.find(t => t.endsWith('_' + singular) || t.endsWith(singular));
        if (endsWithSingular) return endsWithSingular;

        const baseWord = guess.replace(/s$|es$|ies$/, '').replace(/_/g, '');
        const fuzzyMatch = tableNames.find(t => t.includes(baseWord));
        if (fuzzyMatch) return fuzzyMatch;

        return guessedTable;
    };

    const handleNavigateToTable = async (table: string, fkValue: any, fromStackIndex?: number) => {
        if (!activeConnectionId) return;
        const resolvedTable = resolveTableName(table);
        const tableName = resolvedTable || table;

        const requestId = Date.now().toString();
        latestFkRequestId.current = requestId;

        const newContext: FkViewContext = {
            id: requestId,
            tableName,
            fkValue,
            result: null,
            loading: true,
            error: null
        };

        setFkStack(prev => {
            if (fromStackIndex !== undefined) {
                const newStack = prev.slice(0, fromStackIndex + 1);
                return [...newStack, newContext];
            } else {
                return [newContext];
            }
        });

        try {
            const quotedValue = typeof fkValue === 'string' ? `'${fkValue}'` : fkValue;
            const sql = `SELECT * FROM ${tableName} WHERE id = ${quotedValue} LIMIT 1;`;
            const queryResult = await executeQuery(activeConnectionId, sql);

            if (latestFkRequestId.current === requestId) {
                setFkStack(prev => prev.map(item =>
                    item.id === requestId
                        ? { ...item, result: queryResult, loading: false }
                        : item
                ));
            }
        } catch (err) {
            if (latestFkRequestId.current === requestId) {
                const errorMsg = String(err);
                setFkStack(prev => prev.map(item =>
                    item.id === requestId
                        ? { ...item, error: errorMsg, loading: false }
                        : item
                ));
            }
        }
    };

    return (
        <div className="app-container">
            <TitleBar />
            {/* Left Sidebar */}
            <div className="sidebar" style={{ width: leftSidebarWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-color)' }}>
                {/* App Header */}
                <div className="app-header">
                    <div className="app-logo">
                        <img
                            src={isDarkMode ? "/datablaze_logo_black_bg.svg" : "/datablaze_logo_white_bg.svg"}
                            alt="Datablaze"
                            style={{ width: 32, height: 32 }}
                        />
                        <span className="app-name">Datablaze</span>
                    </div>
                </div>


                {/* Connection Selector */}
                <div
                    className="connection-selector"
                    onClick={() => setShowConnectionDropdown(!showConnectionDropdown)}
                    title="Click to manage connections"
                >
                    <div className="connection-selector-content">
                        {activeConnectionId ? (
                            <>
                                <div className="connection-status connected" />
                                <span className="db-logo" style={{ fontSize: '14px', marginRight: '6px' }}>
                                    {connections.find(c => c.id === activeConnectionId)?.config.db_type === 'PostgreSQL' ? '🐘' : '🐬'}
                                </span>
                                <div className="connection-info">
                                    <span className="connection-label">Connected</span>
                                    <span className="connection-name">
                                        {connections.find(c => c.id === activeConnectionId)?.config.name || 'Database'}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="connection-status disconnected" />
                                <div className="connection-info">
                                    <span className="connection-label">No connection</span>
                                    <span className="connection-name">Click to connect</span>
                                </div>
                            </>
                        )}
                    </div>
                    <ChevronDown size={14} className="connection-chevron" />
                </div>

                {/* Connection Dropdown */}
                {showConnectionDropdown && (
                    <>
                        <div className="modal-overlay" style={{ background: 'transparent', zIndex: 999 }} onClick={() => setShowConnectionDropdown(false)} />
                        <div className="connection-dropdown">
                            <div className="connection-dropdown-header">Connections</div>

                            {/* Active connections */}
                            {connections.length > 0 && (
                                <>
                                    {connections.map(conn => (
                                        <div
                                            key={conn.id}
                                            className={`connection-option ${activeConnectionId === conn.id ? 'active' : ''}`}
                                            onClick={() => {
                                                setActiveConnection(conn.id);
                                                setShowConnectionDropdown(false);
                                            }}
                                        >
                                            <div className="connection-icon-wrapper">
                                                <span className="db-logo">
                                                    {conn.config.db_type === 'PostgreSQL' ? '🐘' : '🐬'}
                                                </span>
                                                <div className="connection-status-badge" />
                                            </div>
                                            <div className="connection-details">
                                                <div className="connection-title">{conn.config.name || 'Database'}</div>
                                                <div className="connection-subtitle">
                                                    {conn.config.host}:{conn.config.port}{conn.config.database ? `/${conn.config.database}` : ''}
                                                </div>
                                            </div>
                                            {activeConnectionId === conn.id && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '11px' }}>
                                                    <Command size={10} /> 1
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Saved but not connected */}
                            {savedConnections.filter(saved => !connections.some(c => c.config.name === saved.config.name)).length > 0 && (
                                <>
                                    {connections.length > 0 && <div className="dropdown-divider" />}
                                    <div className="connection-dropdown-header" style={{ borderBottom: 'none', paddingBottom: '4px' }}>Saved</div>
                                    {savedConnections
                                        .filter(saved => !connections.some(c => c.config.name === saved.config.name))
                                        .map(saved => (
                                            <div
                                                key={saved.id}
                                                className="connection-option"
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => {
                                                    setShowConnectionDropdown(false);
                                                    handleConnectSaved(saved);
                                                }}
                                            >
                                                <div className="connection-icon-wrapper">
                                                    <span className="db-logo" style={{ opacity: 0.6 }}>
                                                        {saved.config.db_type === 'PostgreSQL' ? '🐘' : '🐬'}
                                                    </span>
                                                </div>
                                                <div className="connection-details">
                                                    <div className="connection-title">{saved.config.name || 'Database'}</div>
                                                    <div className="connection-subtitle">
                                                        {saved.config.host}:{saved.config.port}{saved.config.database ? `/${saved.config.database}` : ''}
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '10px', color: 'var(--success)' }}>Connect</span>
                                            </div>
                                        ))
                                    }
                                </>
                            )}

                            <div className="dropdown-divider" />

                            <div className="dropdown-action" onClick={() => {
                                setShowConnectionDropdown(false);
                                setShowConnectionModal(true);
                            }}>
                                <Plus size={14} />
                                Add connection
                            </div>

                            <div className="dropdown-action" onClick={() => {
                                setShowConnectionDropdown(false);
                                setShowManageConnectionsModal(true);
                            }}>
                                <Settings size={14} />
                                Manage connections
                            </div>
                        </div>
                    </>
                )}

                {/* Toolbar */}
                <div className="sidebar-toolbar">
                    <span>Schema</span>
                    <div className="sidebar-actions">
                        <div
                            className={`action-btn ${!activeConnectionId ? 'disabled' : ''}`}
                            title={activeConnectionId ? "Create Table (opens template)" : "Connect to a database first"}
                            onClick={handleAddTable}
                        >
                            <Plus size={14} />
                        </div>
                        <div
                            className={`action-btn ${isRefreshing ? 'active' : ''} ${!activeConnectionId ? 'disabled' : ''}`}
                            title={isRefreshing ? "Refreshing..." : "Refresh Schema"}
                            onClick={handleRefreshSchema}
                        >
                            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                        </div>
                        <div
                            className={`action-btn ${sortOrder === 'desc' ? 'active' : ''}`}
                            title={`Sort tables ${sortOrder === 'asc' ? 'Z-A' : 'A-Z'}`}
                            onClick={handleToggleSortOrder}
                        >
                            <ArrowUpDown size={14} />
                        </div>
                    </div>
                </div>

                {/* Search */}
                <div className="table-search">
                    <div className="table-search-input-wrapper" style={{ width: '100%' }}>
                        <Search size={14} color="var(--text-muted)" />
                        <input
                            type="text"
                            placeholder="Search tables..."
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                        />
                    </div>
                </div>

                {/* Tree */}
                <div className="sidebar-content" style={{ flex: 1, overflow: 'auto' }}>
                    <DatabaseTree onTableDataRequest={handleTableDataRequest} filter={tableFilter} sortOrder={sortOrder} />
                </div>

                {/* Footer */}
                <div className="sidebar-footer">
                    <div className="footer-item" onClick={() => setShowSavedQueriesModal(true)}>
                        <FileCode size={14} />
                        <span>Saved Queries</span>
                        {savedQueries.length > 0 && (
                            <span className="tree-badge" style={{ marginLeft: 'auto' }}>{savedQueries.length}</span>
                        )}
                    </div>
                    <div className="footer-item" onClick={() => setShowSettingsModal(true)}>
                        <Settings size={14} />
                        <span>Settings</span>
                    </div>
                    <div className="footer-item">
                        <HelpCircle size={14} />
                        <span>Help</span>
                    </div>
                </div>
            </div>

            {/* Left Sidebar Resizer */}
            <div
                className="resizer-vertical"
                style={{
                    cursor: 'ew-resize',
                    width: '8px',
                    background: 'var(--border-color)',
                    transition: 'background 0.15s',
                    flexShrink: 0,
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startWidth = leftSidebarWidth;

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        moveEvent.preventDefault();
                        const delta = moveEvent.clientX - startX;
                        const newWidth = Math.max(200, Math.min(600, startWidth + delta));
                        setLeftSidebarWidth(newWidth);
                    };

                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                    };

                    document.body.style.cursor = 'ew-resize';
                    document.body.style.userSelect = 'none';

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }}
                onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = 'var(--accent-primary)';
                }}
                onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = 'var(--border-color)';
                }}
            />

            {/* Main Content */}
            <main className="main-content">
                {/* Tabs Bar */}
                <div className="tabs-bar">
                    {queryTabs.map((tab) => (
                        <button
                            key={tab.id}
                            className={`tab ${activeTabId === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            onMouseDown={(e) => {
                                // Middle click to close tab
                                if (e.button === 1) {
                                    e.preventDefault();
                                    handleCloseTab(tab);
                                }
                            }}
                            onAuxClick={(e: React.MouseEvent) => {
                                // Also handle middle click via auxclick
                                if (e.button === 1) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCloseTab(tab);
                                }
                            }}
                        >
                            <FileCode size={14} />
                            {tab.title}
                            {tab.sql.trim() && <span className="tab-unsaved" title="Has content" />}
                            <span
                                className="tab-close"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloseTab(tab);
                                }}
                            >
                                <X size={12} />
                            </span>
                        </button>
                    ))}
                    <button className="add-tab" onClick={addQueryTab} title="New Tab (Ctrl+T)">
                        <Plus size={16} />
                    </button>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className="btn btn-ghost btn-icon"
                            onClick={() => {
                                const newTheme = !isDarkMode ? 'dark' : 'light';
                                setIsDarkMode(!isDarkMode);
                                setSettings(prev => ({ ...prev, theme: newTheme }));
                            }}
                            title={isDarkMode ? 'Light Mode' : 'Dark Mode'}
                        >
                            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="editor-area">
                    {activeTab?.type === 'structure' && activeTab.tableName && activeConnectionId ? (
                        <div style={{ flex: 1, overflow: 'hidden', padding: '0' }}>
                            <StructureView
                                connectionId={activeConnectionId}
                                tableName={activeTab.tableName}
                            />
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <div className="editor-container" style={{ height: editorHeight, minHeight: 100 }}>
                                <div className="editor-toolbar">
                                    <button
                                        className="btn btn-success"
                                        onClick={handleExecute}
                                        disabled={isExecuting || !activeConnectionId}
                                    >
                                        <Play size={14} />
                                        Run
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ marginLeft: '8px' }}
                                        onClick={() => {
                                            if (activeTab && activeTab.sql.trim()) {
                                                setSaveQueryName(activeTab.title || 'Untitled Query');
                                                setShowSaveQueryDialog(true);
                                            }
                                        }}
                                        disabled={!activeTab || !activeTab.sql.trim()}
                                    >
                                        <Save size={14} />
                                        Save
                                    </button>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {activeConnectionId ? (
                                            <>
                                                Connected to:{' '}
                                                <span style={{ color: 'var(--success)' }}>
                                                    {connections.find((c) => c.id === activeConnectionId)?.config.name || 'Database'}
                                                </span>
                                            </>
                                        ) : 'Not connected'}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Ctrl+Enter to execute
                                    </span>
                                </div>
                                <div className="editor-wrapper">
                                    <SqlEditor
                                        value={activeTab?.sql || ''}
                                        onChange={(value) => {
                                            if (activeTab) updateTabSql(activeTab.id, value);
                                        }}
                                        onExecute={handleExecute}
                                        isDarkMode={isDarkMode}
                                    />
                                </div>
                            </div>

                            <div
                                className="resizer"
                                style={{
                                    cursor: 'ns-resize',
                                    height: '8px',
                                    background: 'var(--border-color)',
                                    transition: 'background 0.15s',
                                    flexShrink: 0,
                                }}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const startY = e.clientY;
                                    const startHeight = editorHeight;

                                    const onMouseMove = (moveEvent: MouseEvent) => {
                                        moveEvent.preventDefault();
                                        const delta = moveEvent.clientY - startY;
                                        const newHeight = Math.max(100, Math.min(600, startHeight + delta));
                                        setEditorHeight(newHeight);
                                    };

                                    const onMouseUp = () => {
                                        document.removeEventListener('mousemove', onMouseMove);
                                        document.removeEventListener('mouseup', onMouseUp);
                                        document.body.style.cursor = '';
                                        document.body.style.userSelect = '';
                                    };

                                    // Set cursor and disable selection during drag
                                    document.body.style.cursor = 'ns-resize';
                                    document.body.style.userSelect = 'none';

                                    document.addEventListener('mousemove', onMouseMove);
                                    document.addEventListener('mouseup', onMouseUp);
                                }}
                                onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.background = 'var(--accent-primary)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.background = 'var(--border-color)';
                                }}
                            />

                            <div className="results-area">
                                <ResultsPanel
                                    result={result}
                                    isLoading={isExecuting}
                                    error={error}
                                    onNavigateToTable={handleNavigateToTable}
                                    tables={tables}
                                    showImagePreviews={settings.showImagePreviews}
                                    maxImagePreviewHeight={settings.maxImagePreviewHeight}
                                />
                            </div>
                        </div>
                    )}

                    {/* FK Sidebar */}

                    {fkStack.length > 0 && (() => {
                        const activeContext = fkStack[fkStack.length - 1];
                        const stackIndex = fkStack.length - 1;
                        return (
                            <>
                                <div
                                    className="resizer-vertical"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        const startX = e.clientX;
                                        const startWidth = sidebarWidth;
                                        const onMouseMove = (moveEvent: MouseEvent) => {
                                            const delta = startX - moveEvent.clientX;
                                            const newWidth = Math.max(200, Math.min(800, startWidth + delta));
                                            setSidebarWidth(newWidth);
                                        };
                                        const onMouseUp = () => {
                                            document.removeEventListener('mousemove', onMouseMove);
                                            document.removeEventListener('mouseup', onMouseUp);
                                        };
                                        document.addEventListener('mousemove', onMouseMove);
                                        document.addEventListener('mouseup', onMouseUp);
                                    }}
                                />
                                <div className="fk-sidebar" style={{ width: sidebarWidth }}>
                                    <div className="fk-sidebar-header">
                                        {fkStack.length > 1 && (
                                            <button className="btn btn-ghost btn-icon" onClick={handleFkBack} style={{ marginRight: '8px' }}>
                                                <ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
                                            </button>
                                        )}
                                        <span className="fk-sidebar-title">
                                            {activeContext.tableName ? `Related: ${activeContext.tableName}` : 'Related Data'}
                                        </span>
                                        <button className="btn btn-ghost btn-icon" onClick={closeFkSidebar} style={{ marginLeft: 'auto' }}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div className="fk-sidebar-content">
                                        {activeContext.loading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}
                                        {activeContext.error && <div style={{ padding: '12px', color: 'var(--error)', fontSize: '12px' }}>{activeContext.error}</div>}
                                        {activeContext.result && (
                                            <ResultsPanel
                                                result={activeContext.result}
                                                isLoading={false}
                                                error={null}
                                                onNavigateToTable={(t, v) => handleNavigateToTable(t, v, stackIndex)}
                                                tables={tables}
                                                showImagePreviews={settings.showImagePreviews}
                                                maxImagePreviewHeight={settings.maxImagePreviewHeight}
                                                compact={true}
                                            />
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Status Bar */}
                <div className="status-bar">
                    <div className="status-item">
                        <Database size={12} />
                        {connections.length} connections
                    </div>
                    <div className="status-item">
                        <Clock size={12} />
                        {result ? `${result.execution_time_ms}ms` : 'Ready'}
                    </div>
                    <div className="status-item" style={{ marginLeft: 'auto' }}>
                        Datablaze v0.1.0
                    </div>
                </div>
            </main >

            {/* Modals */}
            < Modal
                isOpen={showConnectionModal}
                onClose={() => setShowConnectionModal(false)
                }
                title="New Connection"
            >
                <ConnectionForm
                    onConnect={() => setShowConnectionModal(false)}
                    onCancel={() => setShowConnectionModal(false)}
                />
            </Modal >

            <Modal
                isOpen={showSaveQueryDialog}
                onClose={() => setShowSaveQueryDialog(false)}
                title="Save Query"
            >
                <div className="form-group">
                    <label className="form-label">Query Name</label>
                    <input
                        type="text"
                        className="form-input"
                        value={saveQueryName}
                        onChange={(e) => setSaveQueryName(e.target.value)}
                        placeholder="Enter query name"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                if (saveQueryName.trim()) {
                                    addSavedQuery(saveQueryName, activeTab!.sql);
                                    setShowSaveQueryDialog(false);
                                }
                            }
                        }}
                    />
                </div>
                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => setShowSaveQueryDialog(false)}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            if (saveQueryName.trim()) {
                                addSavedQuery(saveQueryName, activeTab!.sql);
                                setShowSaveQueryDialog(false);
                            }
                        }}
                        disabled={!saveQueryName.trim()}
                    >
                        Save
                    </button>
                </div>
            </Modal>

            <SavedQueriesModal
                isOpen={showSavedQueriesModal}
                onClose={() => setShowSavedQueriesModal(false)}
                queries={savedQueries}
                onSelect={(sql) => {
                    if (activeTab) updateTabSql(activeTab.id, sql);
                }}
                onDelete={deleteSavedQuery}
            />

            <SettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                settings={settings}
                onSave={(newSettings) => {
                    setSettings(newSettings);
                    setIsDarkMode(newSettings.theme === 'dark');
                    setShowSettingsModal(false);
                }}
            />

            <ManageConnectionsModal
                isOpen={showManageConnectionsModal}
                onClose={() => setShowManageConnectionsModal(false)}
                onAddNew={() => {
                    setShowManageConnectionsModal(false);
                    setShowConnectionModal(true);
                }}
            />

            {/* Custom Confirm Dialog */}
            {
                confirmDialog.isOpen && (
                    <>
                        <div
                            className="modal-overlay"
                            onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                        />
                        <div className="confirm-dialog">
                            <div className={`confirm-dialog-icon ${confirmDialog.variant || 'info'}`}>
                                {confirmDialog.variant === 'danger' && '⚠️'}
                                {confirmDialog.variant === 'warning' && '⚠️'}
                                {confirmDialog.variant === 'info' && 'ℹ️'}
                                {!confirmDialog.variant && 'ℹ️'}
                            </div>
                            <h3 className="confirm-dialog-title">{confirmDialog.title}</h3>
                            <p className="confirm-dialog-message">{confirmDialog.message}</p>
                            <div className="confirm-dialog-actions">
                                {confirmDialog.cancelText && (
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                                    >
                                        {confirmDialog.cancelText}
                                    </button>
                                )}
                                <button
                                    className={`btn ${confirmDialog.variant === 'danger' ? 'btn-danger' : confirmDialog.variant === 'warning' ? 'btn-warning' : 'btn-primary'}`}
                                    onClick={confirmDialog.onConfirm}
                                >
                                    {confirmDialog.confirmText || 'OK'}
                                </button>
                            </div>
                        </div>
                    </>
                )
            }
        </div >
    );
}

export default App;
