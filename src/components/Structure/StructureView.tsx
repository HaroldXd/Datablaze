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
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Column</th>
                            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>Attributes</th>
                            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '2px solid var(--border-color)', background: 'var(--bg-secondary)', minWidth: '200px' }}>Constraints</th>
                        </tr>
                    </thead>
                    <tbody>
                        {structure.columns.map((col: ColumnInfo, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {col.is_primary_key && (
                                            <Key size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} title="Primary Key" />
                                        )}
                                        <span style={{ 
                                            fontWeight: 500, 
                                            color: 'var(--text-primary)',
                                            fontFamily: 'monospace',
                                            fontSize: '13px'
                                        }}>
                                            {col.name}
                                        </span>
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
                                <td style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                        {col.is_nullable && (
                                            <span style={{
                                                fontSize: '10px',
                                                background: 'rgba(34, 197, 94, 0.15)',
                                                color: 'var(--success)',
                                                padding: '3px 6px',
                                                borderRadius: '3px',
                                                fontWeight: 600
                                            }}>
                                                NULL
                                            </span>
                                        )}
                                        {!col.is_nullable && (
                                            <span style={{
                                                fontSize: '10px',
                                                background: 'rgba(239, 68, 68, 0.15)',
                                                color: 'var(--error)',
                                                padding: '3px 6px',
                                                borderRadius: '3px',
                                                fontWeight: 600
                                            }}>
                                                NOT NULL
                                            </span>
                                        )}
                                        {col.default_value !== null && (
                                            <span style={{
                                                fontSize: '10px',
                                                background: 'var(--bg-elevated)',
                                                color: 'var(--text-secondary)',
                                                padding: '3px 6px',
                                                borderRadius: '3px',
                                                fontFamily: 'monospace',
                                                maxWidth: '150px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                display: 'inline-block'
                                            }} title={`Default: ${col.default_value}`}>
                                                = {col.default_value}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {col.is_primary_key && (
                                            <span style={{ fontSize: '10px', background: 'var(--warning)', color: '#000', padding: '3px 7px', borderRadius: '3px', fontWeight: 700 }}>PK</span>
                                        )}
                                        {col.is_unique && (
                                            <span style={{ fontSize: '10px', background: 'var(--accent-primary)', color: 'white', padding: '3px 7px', borderRadius: '3px', fontWeight: 700 }}>UNIQUE</span>
                                        )}
                                        {col.is_foreign_key && col.foreign_key_table && (
                                            <span style={{ fontSize: '10px', background: 'var(--info)', color: 'white', padding: '3px 7px', borderRadius: '3px', fontWeight: 700 }} title={`References ${col.foreign_key_table}(${col.foreign_key_column || 'id'})`}>
                                                FK → {col.foreign_key_table}
                                            </span>
                                        )}
                                        {col.is_auto_increment && (
                                            <span style={{ fontSize: '10px', background: 'var(--success)', color: 'white', padding: '3px 7px', borderRadius: '3px', fontWeight: 700 }}>AUTO_INC</span>
                                        )}
                                        {col.max_length && (
                                            <span style={{ fontSize: '10px', background: 'var(--bg-elevated)', color: 'var(--text-muted)', padding: '3px 7px', borderRadius: '3px', fontWeight: 600, border: '1px solid var(--border-color)' }}>
                                                {col.max_length}
                                            </span>
                                        )}
                                        {col.check_constraint && (
                                            <span style={{ fontSize: '10px', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '3px 7px', borderRadius: '3px', fontWeight: 600, border: '1px solid var(--border-color)' }} title={col.check_constraint}>
                                                CHECK
                                            </span>
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
