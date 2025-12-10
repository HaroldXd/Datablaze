import { useState } from 'react';
import { ConnectionConfig, testConnection, connectDatabase, getTables, listDatabases } from '../../lib/tauri';
import { useConnectionStore } from '../../stores/connectionStore';
import { Database, Loader2, CheckCircle, XCircle, Server, User, Lock, HelpCircle } from 'lucide-react';
import { DatabaseIcon } from '../UI/DatabaseIcon';

interface ConnectionFormProps {
    onConnect?: () => void;
    onCancel?: () => void;
    onClose?: () => void;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({ onConnect, onCancel, onClose }) => {
    const { addConnection, setTables, setConnecting, setError } = useConnectionStore();

    const [config, setConfig] = useState<ConnectionConfig>({
        name: '',
        db_type: 'PostgreSQL',
        host: 'localhost',
        port: 5432,
        database: '',
        username: '',
        password: '',
    });

    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [connecting, setConnectingLocal] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showDatabaseSelector, setShowDatabaseSelector] = useState(false);
    const [availableDatabases, setAvailableDatabases] = useState<string[]>([]);
    const [loadingDatabases, setLoadingDatabases] = useState(false);
    const [tempConnectionId, setTempConnectionId] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setConfig((prev) => ({
            ...prev,
            [name]: name === 'port' ? parseInt(value) || 0 : value,
        }));

        if (name === 'db_type') {
            const dbType = value as 'PostgreSQL' | 'MySQL' | 'SQLite';
            let port = 5432;
            if (dbType === 'MySQL') port = 3306;
            else if (dbType === 'SQLite') port = 0;
            
            setConfig((prev) => ({
                ...prev,
                db_type: dbType,
                port,
            }));
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);

        try {
            const result = await testConnection(config);
            setTestResult({ success: result.success, message: result.message });
        } catch (err) {
            setTestResult({ success: false, message: String(err) });
        } finally {
            setTesting(false);
        }
    };

    const handleConnect = async () => {
        setConnectingLocal(true);
        setConnecting(true);
        setError(null);

        try {
            // If no database is specified, connect and show database selector
            if (!config.database || config.database.trim() === '') {
                // SQLite doesn't need database selection, it needs a file path
                if (config.db_type === 'SQLite') {
                    setError('Please specify a database file path');
                    setConnectingLocal(false);
                    setConnecting(false);
                    return;
                }
                
                const tempConfig = { ...config, database: 'postgres' }; // Default for connection
                if (config.db_type === 'MySQL') {
                    tempConfig.database = 'mysql'; // MySQL default
                }

                const connection = await connectDatabase(tempConfig);
                setTempConnectionId(connection.id);

                // Load available databases
                setLoadingDatabases(true);
                try {
                    const databases = await listDatabases(connection.id);
                    setAvailableDatabases(databases);
                    setShowDatabaseSelector(true);
                } catch (err) {
                    console.error('Failed to list databases:', err);
                    setError('Failed to list available databases');
                } finally {
                    setLoadingDatabases(false);
                }
            } else {
                // Normal connection with specified database
                const connection = await connectDatabase(config);
                addConnection(connection, true);

                // Fetch tables
                const tables = await getTables(connection.id);
                setTables(tables);

                if (onConnect) onConnect();
                else if (onClose) onClose();
            }
        } catch (err) {
            setError(String(err));
        } finally {
            setConnectingLocal(false);
            setConnecting(false);
        }
    };

    const handleSelectDatabase = async (database: string) => {
        if (!tempConnectionId) return;

        setConnectingLocal(true);
        setConnecting(true);
        setError(null);

        try {
            // Connect to the selected database
            const newConfig = { ...config, database };
            const connection = await connectDatabase(newConfig);

            addConnection(connection, true);

            // Fetch tables
            const tables = await getTables(connection.id);
            setTables(tables);

            setShowDatabaseSelector(false);
            if (onConnect) onConnect();
            else if (onClose) onClose();
        } catch (err) {
            setError(String(err));
        } finally {
            setConnectingLocal(false);
            setConnecting(false);
        }
    };

    const dbTypeOptions: Array<{ value: 'PostgreSQL' | 'MySQL' | 'SQLite', label: string, port: number }> = [
        { value: 'PostgreSQL', label: 'PostgreSQL', port: 5432 },
        { value: 'MySQL', label: 'MySQL', port: 3306 },
        { value: 'SQLite', label: 'SQLite', port: 0 },
    ];

    return (
        <div className="connection-form">
            {/* Database Type Selector */}
            <div className="form-section">
                <label className="form-label">Database Type</label>
                <div className="db-type-selector">
                    {dbTypeOptions.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            className={`db-type-option ${config.db_type === opt.value ? 'active' : ''}`}
                            onClick={() => setConfig(prev => ({
                                ...prev,
                                db_type: opt.value,
                                port: opt.port
                            }))}
                        >
                            <span className="db-type-icon">
                                <DatabaseIcon dbType={opt.value} size={20} />
                            </span>
                            <span className="db-type-label">{opt.label}</span>
                        </button>
                    ))}
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
                    value={config.name}
                    onChange={handleChange}
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
                            value={config.host}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="form-group flex-1">
                        <input
                            type="number"
                            name="port"
                            className="form-input"
                            placeholder="Port"
                            value={config.port}
                            onChange={handleChange}
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
                    value={config.database}
                    onChange={handleChange}
                />
            </div>

            {/* Credentials */}
            <div className="form-section">
                <label className="form-label">
                    <User size={14} />
                    Authentication
                </label>
                <div className="form-row">
                    <div className="form-group flex-1">
                        <input
                            type="text"
                            name="username"
                            className="form-input"
                            placeholder="Username"
                            value={config.username}
                            onChange={handleChange}
                        />
                    </div>
                    <div className="form-group flex-1">
                        <div className="input-with-icon">
                            <Lock size={14} className="input-icon" />
                            <input
                                type="password"
                                name="password"
                                className="form-input"
                                placeholder="Password"
                                value={config.password}
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced Options Toggle */}
            <button
                type="button"
                className="advanced-toggle"
                onClick={() => setShowAdvanced(!showAdvanced)}
            >
                <HelpCircle size={14} />
                {showAdvanced ? 'Hide' : 'Show'} Advanced Options
            </button>

            {showAdvanced && (
                <div className="advanced-options">
                    <div className="advanced-info">
                        <p>💡 <strong>Tip:</strong> Leave the database field empty to connect to the server and browse available databases.</p>
                    </div>
                </div>
            )}

            {/* Test Result */}
            {testResult && (
                <div className={`connection-test-result ${testResult.success ? 'success' : 'error'}`}>
                    {testResult.success ? (
                        <CheckCircle size={18} />
                    ) : (
                        <XCircle size={18} />
                    )}
                    <span>{testResult.message}</span>
                </div>
            )}

            {/* Database Selector Modal */}
            {showDatabaseSelector && (
                <div className="database-selector-panel" style={{
                    marginTop: '16px',
                    padding: '16px',
                    background: 'var(--bg-elevated)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                }}>
                    <h3 style={{
                        marginBottom: '12px',
                        fontSize: '14px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <DatabaseIcon dbType={config.db_type} size={20} />
                        Select a Database
                    </h3>

                    {loadingDatabases ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '24px',
                            gap: '8px'
                        }}>
                            <Loader2 size={20} className="animate-spin" />
                            <span style={{ color: 'var(--text-muted)' }}>Loading databases...</span>
                        </div>
                    ) : availableDatabases.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '24px',
                            color: 'var(--text-muted)'
                        }}>
                            No databases found
                        </div>
                    ) : (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '8px',
                            maxHeight: '300px',
                            overflowY: 'auto'
                        }}>
                            {availableDatabases.map((db) => (
                                <button
                                    key={db}
                                    type="button"
                                    className="database-option"
                                    onClick={() => handleSelectDatabase(db)}
                                    disabled={connecting}
                                    style={{
                                        padding: '12px',
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--accent-primary)';
                                        e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'var(--bg-secondary)';
                                        e.currentTarget.style.borderColor = 'var(--border-color)';
                                        e.currentTarget.style.color = '';
                                    }}
                                >
                                    <Database size={16} />
                                    {db}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                            setShowDatabaseSelector(false);
                            setAvailableDatabases([]);
                            setTempConnectionId(null);
                        }}
                        style={{ marginTop: '12px', width: '100%' }}
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Actions */}
            <div className="form-actions">
                <button className="btn btn-ghost" onClick={onCancel || onClose}>
                    Cancel
                </button>
                <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
                    {testing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                    Test
                </button>
                <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                    {connecting ? <Loader2 size={16} className="animate-spin" /> : null}
                    Connect
                </button>
            </div>
        </div>
    );
};

export default ConnectionForm;
