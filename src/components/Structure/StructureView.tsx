import React, { useEffect, useState } from 'react';
import { getTableStructure, TableStructure, ColumnInfo } from '../../lib/tauri';
import { Loader2, RefreshCw, Key, AlertCircle } from 'lucide-react';

interface StructureViewProps {
    connectionId: string;
    tableName: string;
}

export const StructureView: React.FC<StructureViewProps> = ({ connectionId, tableName }) => {
    const [structure, setStructure] = useState<TableStructure | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStructure = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getTableStructure(connectionId, tableName);
            setStructure(data);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStructure();
    }, [connectionId, tableName]);

    if (loading && !structure) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '16px', color: 'var(--text-muted)' }}>
                <Loader2 className="animate-spin" size={32} />
                <span>Loading structure for {tableName}...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '24px', color: 'var(--error)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <AlertCircle size={20} />
                    <h3>Error loading structure</h3>
                </div>
                <p>{error}</p>
                <button
                    className="btn btn-secondary"
                    onClick={loadStructure}
                    style={{ marginTop: '16px' }}
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!structure) return null;

    return (
        <div className="structure-view" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="structure-toolbar" style={{
                padding: '12px 24px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-secondary)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 600 }}>{structure.table_name}</h2>
                    <span style={{
                        fontSize: '12px',
                        background: 'var(--bg-elevated)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: 'var(--text-muted)'
                    }}>
                        {structure.columns.length} columns
                    </span>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={loadStructure} title="Refresh Structure">
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="structure-content" style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Column Name</th>
                            <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Data Type</th>
                            <th style={{ textAlign: 'center', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Nullable</th>
                            <th style={{ textAlign: 'center', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Default</th>
                            <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, minWidth: '200px', borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Constraints</th>
                        </tr>
                    </thead>
                    <tbody>
                        {structure.columns.map((col: ColumnInfo, idx: number) => (
                            <tr key={idx} style={{ borderBottom: idx < structure.columns.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {col.is_primary_key ? (
                                            <div title="Primary Key" style={{ color: 'var(--warning)', display: 'flex' }}><Key size={14} /></div>
                                        ) : (
                                            <div style={{ width: 14 }} />
                                        )}
                                        <span style={{ color: 'var(--text-primary)' }}>{col.name}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                    <span style={{
                                        color: 'var(--accent-primary)',
                                        fontFamily: 'monospace',
                                        fontSize: '13px'
                                    }}>
                                        {col.data_type}
                                    </span>
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                    {col.is_nullable && (
                                        <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: 'var(--success)',
                                            margin: '0 auto',
                                            opacity: 0.8
                                        }} title="Nullable" />
                                    )}
                                </td>
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                    {col.default_value !== null ? col.default_value : <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>-</span>}
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {col.is_primary_key && (
                                            <span style={{ fontSize: '10px', background: 'var(--warning)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>PRIMARY KEY</span>
                                        )}
                                        {col.is_unique && (
                                            <span style={{ fontSize: '10px', background: 'var(--accent-primary)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>UNIQUE</span>
                                        )}
                                        {col.is_foreign_key && col.foreign_key_table && (
                                            <span style={{ fontSize: '10px', background: 'var(--info)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }} title={`References ${col.foreign_key_table}(${col.foreign_key_column || 'id'})`}>FK → {col.foreign_key_table}</span>
                                        )}
                                        {col.is_auto_increment && (
                                            <span style={{ fontSize: '10px', background: 'var(--success)', color: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>AUTO INCREMENT</span>
                                        )}
                                        {col.max_length && (
                                            <span style={{ fontSize: '10px', background: 'var(--bg-elevated)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '3px', fontWeight: 500 }}>MAX: {col.max_length}</span>
                                        )}
                                        {col.check_constraint && (
                                            <span style={{ fontSize: '10px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '3px', fontWeight: 500 }} title={col.check_constraint}>CHECK</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
