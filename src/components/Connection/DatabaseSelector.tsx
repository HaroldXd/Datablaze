import React, { useState, useEffect } from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { listDatabases } from '../../lib/tauri';

interface DatabaseSelectorProps {
    connectionId: string;
    currentDatabase: string;
    onSelectDatabase: (database: string) => void;
}

export const DatabaseSelector: React.FC<DatabaseSelectorProps> = ({
    connectionId,
    currentDatabase,
    onSelectDatabase,
}) => {
    const [databases, setDatabases] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (connectionId) {
            loadDatabases();
        }
    }, [connectionId]);

    const loadDatabases = async () => {
        setLoading(true);
        setError(null);
        try {
            const dbs = await listDatabases(connectionId);
            setDatabases(dbs);
        } catch (err) {
            setError(String(err));
            console.error('Error loading databases:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectDatabase = (database: string) => {
        onSelectDatabase(database);
        setIsOpen(false);
    };

    return (
        <div className="database-selector">
            <label className="form-label">
                <Database size={14} />
                Current Database
            </label>
            <div className="selector-container">
                <button
                    type="button"
                    className="selector-button"
                    onClick={() => setIsOpen(!isOpen)}
                    disabled={loading}
                >
                    <Database size={16} />
                    <span className="selector-value">{currentDatabase || 'Select database...'}</span>
                    <span className="selector-arrow">{isOpen ? '▲' : '▼'}</span>
                </button>
                
                <button
                    type="button"
                    className="selector-refresh"
                    onClick={loadDatabases}
                    disabled={loading}
                    title="Refresh databases"
                >
                    {loading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <RefreshCw size={14} />
                    )}
                </button>

                {isOpen && (
                    <div className="selector-dropdown">
                        {loading ? (
                            <div className="selector-loading">
                                <Loader2 size={16} className="animate-spin" />
                                <span>Loading databases...</span>
                            </div>
                        ) : error ? (
                            <div className="selector-error">
                                <span>Error: {error}</span>
                            </div>
                        ) : databases.length === 0 ? (
                            <div className="selector-empty">
                                <span>No databases found</span>
                            </div>
                        ) : (
                            <div className="selector-list">
                                {databases.map((db) => (
                                    <button
                                        key={db}
                                        type="button"
                                        className={`selector-item ${db === currentDatabase ? 'active' : ''}`}
                                        onClick={() => handleSelectDatabase(db)}
                                    >
                                        <Database size={14} />
                                        <span>{db}</span>
                                        {db === currentDatabase && <span className="selector-check">✓</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DatabaseSelector;
