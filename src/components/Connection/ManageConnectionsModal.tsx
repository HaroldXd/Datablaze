import React, { useState, useEffect } from 'react';
import { X, Database, Trash2, Edit3, Plus, Check, XCircle, Loader2, Server, ExternalLink } from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { SavedConnection, updateSavedConnection } from '../../lib/storage';
import { ConnectionConfig, testConnection, connectDatabase, getTables } from '../../lib/tauri';
import { DatabaseIcon } from '../UI/DatabaseIcon';

interface ManageConnectionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddNew: () => void;
}

type ViewMode = 'list' | 'edit';

export const ManageConnectionsModal: React.FC<ManageConnectionsModalProps> = ({
    isOpen,
    onClose,
    onAddNew,
}) => {
    const {
        savedConnections,
        connections,
        activeConnectionId,
        removeSavedConnectionById,
        removeConnection,
        loadSavedConnections,
        addConnection,
        setTables,
        setActiveConnection,
    } = useConnectionStore();

    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null);
    const [editConfig, setEditConfig] = useState<ConnectionConfig | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadSavedConnections();
            setViewMode('list');
            setEditingConnection(null);
            setEditConfig(null);
            setTestResult(null);
            setDeleteConfirm(null);
        }
    }, [isOpen, loadSavedConnections]);

    if (!isOpen) return null;

    const handleEditClick = (conn: SavedConnection) => {
        setEditingConnection(conn);
        setEditConfig({ ...conn.config });
        setViewMode('edit');
        setTestResult(null);
    };

    const handleCancelEdit = () => {
        setViewMode('list');
        setEditingConnection(null);
        setEditConfig(null);
        setTestResult(null);
    };

    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (!editConfig) return;

        const { name, value } = e.target;
        setEditConfig((prev) => {
            if (!prev) return prev;

            const updated = {
                ...prev,
                [name]: name === 'port' ? parseInt(value) || 0 : value,
            };

            if (name === 'db_type') {
                const dbType = value as 'PostgreSQL' | 'MySQL' | 'SQLite';
                updated.db_type = dbType;
                if (dbType === 'PostgreSQL') updated.port = 5432;
                else if (dbType === 'MySQL') updated.port = 3306;
                else if (dbType === 'SQLite') updated.port = 0;
            }

            return updated;
        });
    };

    const handleTestConnection = async () => {
        if (!editConfig) return;

        setTesting(true);
        setTestResult(null);

        try {
            const result = await testConnection(editConfig);
            setTestResult({ success: result.success, message: result.message });
        } catch (err) {
            setTestResult({ success: false, message: String(err) });
        } finally {
            setTesting(false);
        }
    };

    const handleSaveChanges = () => {
        if (!editingConnection || !editConfig) return;

        updateSavedConnection(editingConnection.id, editConfig, true);
        loadSavedConnections();
        handleCancelEdit();
    };

    const handleDelete = (id: string) => {
        // Remove from saved connections
        removeSavedConnectionById(id);
        // Also remove from active connections if connected
        removeConnection(id);
        setDeleteConfirm(null);
    };

    const handleConnect = async (conn: SavedConnection) => {
        setConnecting(true);

        try {
            const connection = await connectDatabase(conn.config);
            addConnection(connection, true);
            const tables = await getTables(connection.id);
            setTables(tables);
            setActiveConnection(connection.id);
            onClose();
        } catch (err) {
            console.error('Failed to connect:', err);
        } finally {
            setConnecting(false);
        }
    };

    const isConnected = (id: string) => {
        return connections.some((c) => c.id === id);
    };

    const isActive = (id: string) => {
        return activeConnectionId === id;
    };

    const getDatabaseTypeBadge = (dbType: string) => {
        const colors = {
            PostgreSQL: { bg: 'rgba(50, 115, 220, 0.15)', color: '#5294e2' },
            MySQL: { bg: 'rgba(247, 150, 70, 0.15)', color: '#f79646' },
            SQLite: { bg: 'rgba(15, 128, 204, 0.15)', color: '#0F80CC' },
        };
        const style = colors[dbType as keyof typeof colors] || { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' };

        return (
            <span
                style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500,
                    background: style.bg,
                    color: style.color,
                }}
            >
                {dbType}
            </span>
        );
    };

    return (
        <div className="modal-overlay animate-fadeIn" onClick={onClose}>
            <div
                className="modal animate-slideUp"
                style={{ width: '600px', maxWidth: '90vw', maxHeight: '80vh' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 className="modal-title">
                        {viewMode === 'list' ? 'Manage Connections' : 'Edit Connection'}
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(80vh - 60px)' }}>
                    {viewMode === 'list' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Connection List */}
                            <div
                                style={{
                                    flex: 1,
                                    overflow: 'auto',
                                    padding: '16px',
                                    maxHeight: '400px',
                                }}
                            >
                                {savedConnections.length === 0 ? (
                                    <div
                                        style={{
                                            textAlign: 'center',
                                            padding: '48px 24px',
                                            color: 'var(--text-muted)',
                                        }}
                                    >
                                        <Server size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                                        <p style={{ marginBottom: '16px' }}>No saved connections yet</p>
                                        <button className="btn btn-primary" onClick={onAddNew}>
                                            <Plus size={16} />
                                            Add Your First Connection
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {savedConnections.map((conn) => (
                                            <div
                                                key={conn.id}
                                                className="connection-card"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '12px 16px',
                                                    background: isActive(conn.id)
                                                        ? 'rgba(var(--accent-primary-rgb), 0.1)'
                                                        : 'var(--bg-elevated)',
                                                    borderRadius: '8px',
                                                    border: isActive(conn.id)
                                                        ? '1px solid var(--accent-primary)'
                                                        : '1px solid var(--border-color)',
                                                    gap: '12px',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                {/* Icon */}
                                                <div
                                                    style={{
                                                        width: '40px',
                                                        height: '40px',
                                                        borderRadius: '8px',
                                                        background: isConnected(conn.id)
                                                            ? 'rgba(var(--success-rgb), 0.15)'
                                                            : 'var(--bg-secondary)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: isConnected(conn.id) ? 'var(--success)' : 'var(--text-muted)',
                                                    }}
                                                >
                                                    <DatabaseIcon dbType={conn.config.db_type} size={24} />
                                                </div>

                                                {/* Info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            marginBottom: '4px',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontWeight: 600,
                                                                color: 'var(--text-primary)',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            {conn.config.name || 'Unnamed Connection'}
                                                        </span>
                                                        {getDatabaseTypeBadge(conn.config.db_type)}
                                                        {isConnected(conn.id) && (
                                                            <span
                                                                style={{
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '10px',
                                                                    fontWeight: 600,
                                                                    background: 'rgba(34, 197, 94, 0.15)',
                                                                    color: 'var(--success)',
                                                                    textTransform: 'uppercase',
                                                                }}
                                                            >
                                                                Connected
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: '12px',
                                                            color: 'var(--text-muted)',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {conn.config.host}:{conn.config.port}/{conn.config.database} •{' '}
                                                        {conn.config.username}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {deleteConfirm === conn.id ? (
                                                        <>
                                                            <button
                                                                className="btn btn-ghost btn-icon"
                                                                onClick={() => setDeleteConfirm(null)}
                                                                title="Cancel"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                            <button
                                                                className="btn btn-icon"
                                                                style={{
                                                                    background: 'var(--error)',
                                                                    color: 'white',
                                                                }}
                                                                onClick={() => handleDelete(conn.id)}
                                                                title="Confirm Delete"
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {!isConnected(conn.id) && (
                                                                <button
                                                                    className="btn btn-ghost btn-icon"
                                                                    onClick={() => handleConnect(conn)}
                                                                    title="Connect"
                                                                    disabled={connecting}
                                                                >
                                                                    {connecting ? (
                                                                        <Loader2 size={16} className="animate-spin" />
                                                                    ) : (
                                                                        <ExternalLink size={16} />
                                                                    )}
                                                                </button>
                                                            )}
                                                            <button
                                                                className="btn btn-ghost btn-icon"
                                                                onClick={() => handleEditClick(conn)}
                                                                title="Edit"
                                                            >
                                                                <Edit3 size={16} />
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost btn-icon"
                                                                onClick={() => setDeleteConfirm(conn.id)}
                                                                title="Delete"
                                                                style={{ color: 'var(--error)' }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            {savedConnections.length > 0 && (
                                <div
                                    style={{
                                        padding: '12px 16px',
                                        borderTop: '1px solid var(--border-color)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}
                                >
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {savedConnections.length} connection{savedConnections.length !== 1 ? 's' : ''}{' '}
                                        saved
                                    </span>
                                    <button className="btn btn-primary" onClick={onAddNew}>
                                        <Plus size={16} />
                                        Add Connection
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Edit View */
                        <div className="connection-form" style={{ padding: '20px' }}>
                            {/* Database Type Selector */}
                            <div className="form-section">
                                <label className="form-label">Database Type</label>
                                <div className="db-type-selector">
                                    <button
                                        type="button"
                                        className={`db-type-option ${editConfig?.db_type === 'PostgreSQL' ? 'active' : ''}`}
                                        onClick={() => setEditConfig(prev => prev ? {
                                            ...prev,
                                            db_type: 'PostgreSQL',
                                            port: 5432
                                        } : prev)}
                                    >
                                        <span className="db-type-icon">
                                            <DatabaseIcon dbType="PostgreSQL" size={20} />
                                        </span>
                                        <span className="db-type-label">PostgreSQL</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`db-type-option ${editConfig?.db_type === 'MySQL' ? 'active' : ''}`}
                                        onClick={() => setEditConfig(prev => prev ? {
                                            ...prev,
                                            db_type: 'MySQL',
                                            port: 3306
                                        } : prev)}
                                    >
                                        <span className="db-type-icon">
                                            <DatabaseIcon dbType="MySQL" size={20} />
                                        </span>
                                        <span className="db-type-label">MySQL</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`db-type-option ${editConfig?.db_type === 'SQLite' ? 'active' : ''}`}
                                        onClick={() => setEditConfig(prev => prev ? {
                                            ...prev,
                                            db_type: 'SQLite',
                                            port: 0
                                        } : prev)}
                                    >
                                        <span className="db-type-icon">
                                            <DatabaseIcon dbType="SQLite" size={20} />
                                        </span>
                                        <span className="db-type-label">SQLite</span>
                                    </button>
                                </div>
                            </div>

                            {/* Connection Name */}
                            <div className="form-group">
                                <label className="form-label">
                                    Connection Name
                                    <span className="form-hint">A friendly name for this connection</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    className="form-input"
                                    placeholder="My Production DB"
                                    value={editConfig?.name || ''}
                                    onChange={handleConfigChange}
                                />
                            </div>

                            {/* Server Details */}
                            <div className="form-section">
                                <label className="form-label">
                                    <Server size={14} />
                                    Server Details
                                </label>
                                <div className="form-row">
                                    <div className="form-group flex-2">
                                        <input
                                            type="text"
                                            name="host"
                                            className="form-input"
                                            placeholder="localhost or IP address"
                                            value={editConfig?.host || ''}
                                            onChange={handleConfigChange}
                                        />
                                    </div>
                                    <div className="form-group flex-1">
                                        <input
                                            type="number"
                                            name="port"
                                            className="form-input"
                                            placeholder="Port"
                                            value={editConfig?.port || 5432}
                                            onChange={handleConfigChange}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Database Name */}
                            <div className="form-group">
                                <label className="form-label">
                                    <Database size={14} />
                                    Database Name
                                    <span className="form-hint optional">Leave empty to see available databases</span>
                                </label>
                                <input
                                    type="text"
                                    name="database"
                                    className="form-input"
                                    placeholder="my_database (optional)"
                                    value={editConfig?.database || ''}
                                    onChange={handleConfigChange}
                                />
                            </div>

                            {/* Credentials */}
                            <div className="form-section">
                                <label className="form-label">Authentication</label>
                                <div className="form-row">
                                    <div className="form-group flex-1">
                                        <input
                                            type="text"
                                            name="username"
                                            className="form-input"
                                            placeholder="Username"
                                            value={editConfig?.username || ''}
                                            onChange={handleConfigChange}
                                        />
                                    </div>
                                    <div className="form-group flex-1">
                                        <input
                                            type="password"
                                            name="password"
                                            className="form-input"
                                            placeholder="Password"
                                            value={editConfig?.password || ''}
                                            onChange={handleConfigChange}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Test Result */}
                            {testResult && (
                                <div className={`connection-test-result ${testResult.success ? 'success' : 'error'}`}>
                                    {testResult.success ? (
                                        <Check size={18} />
                                    ) : (
                                        <XCircle size={18} />
                                    )}
                                    <span>{testResult.message}</span>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="form-actions">
                                <button className="btn btn-ghost" onClick={handleCancelEdit}>
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleTestConnection}
                                    disabled={testing}
                                >
                                    {testing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                                    Test
                                </button>
                                <button className="btn btn-primary" onClick={handleSaveChanges}>
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ManageConnectionsModal;
