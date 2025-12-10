import React from 'react';
import { X, Play, Trash2, FileCode } from 'lucide-react';
import { SavedQuery } from '../../lib/storage';

interface SavedQueriesModalProps {
    isOpen: boolean;
    onClose: () => void;
    queries: SavedQuery[];
    onSelect: (sql: string) => void;
    onDelete: (id: string) => void;
}

export const SavedQueriesModal: React.FC<SavedQueriesModalProps> = ({
    isOpen,
    onClose,
    queries,
    onSelect,
    onDelete
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '600px', maxHeight: '70vh' }}>
                <div className="modal-header">
                    <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileCode size={20} />
                        Saved Queries
                    </div>
                    <button className="btn-ghost btn-icon" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body" style={{ padding: '0' }}>
                    {queries.length === 0 ? (
                        <div className="empty-state" style={{ padding: '40px' }}>
                            <FileCode size={48} className="empty-state-icon" />
                            <div className="empty-state-title">No saved queries</div>
                            <div className="empty-state-text">
                                Save your favorite queries to access them quickly later.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {queries.map(query => (
                                <div
                                    key={query.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 20px',
                                        borderBottom: '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s'
                                    }}
                                    className="saved-query-item"
                                    onClick={() => {
                                        onSelect(query.sql);
                                        onClose();
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0, marginRight: '16px' }}>
                                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>{query.name}</div>
                                        <div style={{
                                            fontSize: '12px',
                                            color: 'var(--text-muted)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            fontFamily: 'monospace'
                                        }}>
                                            {query.sql}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            title="Load Query"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelect(query.sql);
                                                onClose();
                                            }}
                                        >
                                            <Play size={14} />
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-icon"
                                            title="Delete"
                                            style={{ color: 'var(--error)' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm('Delete this saved query?')) {
                                                    onDelete(query.id);
                                                }
                                            }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
