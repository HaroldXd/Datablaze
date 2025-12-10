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
                <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Column Name</th>
                            <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Data Type</th>
                            <th style={{ textAlign: 'center', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Nullable</th>
                            <th style={{ textAlign: 'center', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Default</th>
                            <th style={{ textAlign: 'left', padding: '8px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Extra</th>
                        </tr>
                    </thead>
                    <tbody>
                        {structure.columns.map((col: ColumnInfo, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '8px 16px', fontWeight: 500, border: 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {col.is_primary_key ? (
                                            <div title="Primary Key" style={{ color: 'var(--warning)', display: 'flex' }}><Key size={14} /></div>
                                        ) : (
                                            <div style={{ width: 14 }} />
                                        )}
                                        <span style={{ color: 'var(--text-primary)' }}>{col.name}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '8px 16px', border: 'none' }}>
                                    <span style={{
                                        color: 'var(--accent-primary)',
                                        fontFamily: 'monospace',
                                        fontSize: '13px'
                                    }}>
                                        {col.data_type}
                                    </span>
                                </td>
                                <td style={{ padding: '8px 16px', textAlign: 'center', border: 'none' }}>
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
                                <td style={{ padding: '8px 16px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '12px', border: 'none' }}>
                                    {col.default_value !== null ? col.default_value : <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>-</span>}
                                </td>
                                <td style={{ padding: '8px 16px', border: 'none' }}></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
