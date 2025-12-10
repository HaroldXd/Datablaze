import { useState } from 'react';
import { ConnectionConfig, testConnection, connectDatabase, getTables } from '../../lib/tauri';
import { useConnectionStore } from '../../stores/connectionStore';
import { Database, Loader2, CheckCircle, XCircle, Server, User, Lock, HelpCircle, FolderOpen } from 'lucide-react';
import { DatabaseIcon } from '../UI/DatabaseIcon';
import { open } from '@tauri-apps/plugin-dialog';

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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setConfig((prev) => ({
            ...prev,
            [name]: name === 'port' ? parseInt(value) || 0 : value,
        }));

        if (name === 'db_type') {
            const dbType = value as 'PostgreSQL' | 'MySQL' | 'SQLite' | 'SQLServer';
            let port = 5432;
            if (dbType === 'MySQL') port = 3306;
            else if (dbType === 'SQLite') port = 0;
            else if (dbType === 'SQLServer') port = 1433;

            setConfig((prev) => ({
                ...prev,
                db_type: dbType,
                port,
            }));
        }
    };

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'SQLite Database',
                    extensions: ['db', 'sqlite', 'sqlite3', 'db3']
                }, {
                    name: 'All Files',
                    extensions: ['*']
                }]
            });

            if (selected && typeof selected === 'string') {
                setConfig(prev => ({
                    ...prev,
                    database: selected
                }));
            }
        } catch (err) {
            console.error('Failed to open file dialog:', err);
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
            // If no database is specified, connect and show available databases in the tree
            if (!config.database || config.database.trim() === '') {
                // SQLite doesn't need database selection, it needs a file path
                if (config.db_type === 'SQLite') {
                    setError('Please specify a database file path');
                    setConnectingLocal(false);
                    setConnecting(false);
                    return;
                }

                // Connect to the default system database for listing purposes
                const tempConfig = { ...config, database: 'postgres' }; // Default for PostgreSQL
                if (config.db_type === 'MySQL') {
                    tempConfig.database = 'mysql'; // MySQL default
                } else if (config.db_type === 'SQLServer') {
                    tempConfig.database = 'master'; // SQL Server default
                }

                const connection = await connectDatabase(tempConfig);

                // Save the connection but with EMPTY database in config
                // This way the tree will load and show the available databases
                const savedConfig = { ...config, database: '' };
                const connectionWithEmptyDb = {
                    ...connection,
                    config: savedConfig
                };

                addConnection(connectionWithEmptyDb, true);

                // Close the modal - the tree will now show available databases
                if (onConnect) onConnect();
                else if (onClose) onClose();
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

    const dbTypeOptions: Array<{ value: 'PostgreSQL' | 'MySQL' | 'SQLite' | 'SQLServer', label: string, port: number }> = [
        { value: 'PostgreSQL', label: 'PostgreSQL', port: 5432 },
        { value: 'MySQL', label: 'MySQL', port: 3306 },
        { value: 'SQLite', label: 'SQLite', port: 0 },
        { value: 'SQLServer', label: 'SQL Server', port: 1433 },
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

            {/* Server Details - Not needed for SQLite */}
            {config.db_type !== 'SQLite' && (
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
            )}

            {/* Database Name / File Path */}
            <div className="form-group">
                <label className="form-label">
                    <Database size={14} />
                    {config.db_type === 'SQLite' ? 'Database File' : 'Database Name'}
                    {config.db_type !== 'SQLite' && (
                        <span className="form-hint optional">
                            Optional - leave empty to browse all databases
                        </span>
                    )}
                </label>
                {config.db_type === 'SQLite' ? (
                    <div className="form-row" style={{ gap: '8px' }}>
                        <input
                            type="text"
                            name="database"
                            className="form-input"
                            placeholder="Select or enter database file path..."
                            value={config.database}
                            onChange={handleChange}
                            style={{ flex: 1 }}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleSelectFile}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            <FolderOpen size={16} />
                            Browse
                        </button>
                    </div>
                ) : (
                    <input
                        type="text"
                        name="database"
                        className="form-input"
                        placeholder={config.db_type === 'SQLServer'
                            ? "Leave empty to list all databases"
                            : "my_database (optional)"}
                        value={config.database}
                        onChange={handleChange}
                    />
                )}
            </div>

            {/* Credentials - Not needed for SQLite */}
            {config.db_type !== 'SQLite' && (
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
            )}

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
