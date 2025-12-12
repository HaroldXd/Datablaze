import React, { useState, useEffect } from 'react';
import { QueryResult, executeQuery } from '../../lib/tauri';
import { Table, Code, ExternalLink, Copy, Download, CheckSquare, Square, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Edit2, Check, X } from 'lucide-react';
import { JsonViewer } from './JsonViewer';

interface TableInfo {
    schema: string;
    name: string;
    row_count: number | null;
}

interface ResultsPanelProps {
    result: QueryResult | null;
    isLoading: boolean;
    error: string | null;
    onNavigateToTable?: (table: string, foreignKeyValue: any) => void;
    tables?: TableInfo[]; // For FK resolution display
    showImagePreviews?: boolean;
    maxImagePreviewHeight?: number;
    compact?: boolean;
    // For cell editing and DB updates
    connectionId?: string;
    tableName?: string;
}

type ViewMode = 'table' | 'json' | 'card';

// Simple pluralization with common irregular cases
function pluralize(word: string): string {
    // Common irregular endings
    if (word.endsWith('y')) {
        // Check if it's a vowel + y (stays as is) or consonant + y (becomes ies)
        const beforeY = word.charAt(word.length - 2);
        if ('aeiou'.includes(beforeY)) {
            return word + 's'; // day -> days
        }
        return word.slice(0, -1) + 'ies'; // category -> categories
    }
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) {
        return word + 'es'; // class -> classes
    }
    return word + 's';
}

// Detect if a column is likely a foreign key based on naming conventions
// Returns the actual table name if it exists in the database
function isForeignKeyColumn(columnName: string, tables?: TableInfo[]): string | null {
    const lower = columnName.toLowerCase();

    if (!tables || tables.length === 0) return null;

    const tableNames = tables.map(t => t.name.toLowerCase());

    // Common patterns: user_id, userId, category_id, etc.
    if (lower.endsWith('_id') && lower !== 'id') {
        // Extract table name: "user_id" -> "users", "client_id" -> "clients"
        const baseName = lower.replace(/_id$/, '');
        const pluralName = pluralize(baseName);

        // Try multiple variations and check if they exist
        const variations = [
            pluralName,           // users, clients
            baseName,             // user, client
            `${baseName}s`,       // explicit plural
        ];

        for (const variant of variations) {
            if (tableNames.includes(variant)) {
                // Return the actual table name with correct casing
                return tables.find(t => t.name.toLowerCase() === variant)?.name || null;
            }
        }
    }

    if (lower.endsWith('id') && lower.length > 2 && lower !== 'id') {
        // camelCase: userId -> users, clientId -> clients
        const baseName = lower.replace(/id$/i, '');
        const pluralName = pluralize(baseName);

        const variations = [pluralName, baseName, `${baseName}s`];

        for (const variant of variations) {
            if (tableNames.includes(variant)) {
                return tables.find(t => t.name.toLowerCase() === variant)?.name || null;
            }
        }
    }

    return null;
}

// Check if a string looks like a Base64 image (data URI)
function isBase64Image(value: string): boolean {
    if (typeof value !== 'string') return false;
    return value.startsWith('data:image/');
}

// Check if a string looks like raw Base64 data (no data: prefix)
function isRawBase64(value: string): boolean {
    if (typeof value !== 'string') return false;
    if (value.length < 100) return false; // Too short to be meaningful base64
    // Check if it matches Base64 pattern (only alphanumeric, +, /, =)
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(value.substring(0, 200)); // Check first 200 chars
}

// Try to detect the image type from raw base64
function detectImageType(base64: string): string | null {
    // Common image magic bytes in base64
    const signatures: { [key: string]: string } = {
        '/9j/': 'jpeg',
        'iVBORw': 'png',
        'R0lGOD': 'gif',
        'UklGR': 'webp',
    };
    for (const [sig, type] of Object.entries(signatures)) {
        if (base64.startsWith(sig)) return type;
    }
    return null;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
    result,
    isLoading,
    error,
    onNavigateToTable,
    tables,
    showImagePreviews = true,
    maxImagePreviewHeight = 60,
    compact = false,
    connectionId,
    tableName
}) => {
    // Default to card view if compact, otherwise table
    const [viewMode, setViewMode] = useState<ViewMode>(compact ? 'card' : 'table');
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
    const [copyFeedback, setCopyFeedback] = useState<'json' | 'csv' | null>(null);

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // Cell Context Menu state
    const [cellContextMenu, setCellContextMenu] = useState<{ x: number; y: number; value: any; rowIndex: number; colKey: string } | null>(null);

    // Editing state
    const [editingCell, setEditingCell] = useState<{ rowIndex: number; colKey: string; value: any } | null>(null);

    // Image Modal State
    const [expandedImage, setExpandedImage] = useState<string | null>(null);

    // Cell Edit Feedback State
    const [cellEditFeedback, setCellEditFeedback] = useState<{ type: 'success' | 'cancel' | 'error'; message: string } | null>(null);

    // Local modified rows state (for in-memory editing)
    const [localRows, setLocalRows] = useState<Record<string, any>[] | null>(null);

    // Column widths state for resizing
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(100);

    // Reset selection and local rows when result changes
    useEffect(() => {
        setSelectedRows(new Set());
        setSortConfig(null);
        // Reset local rows when result changes
        setLocalRows(result?.rows ? [...result.rows] : null);
        // Reset column widths
        setColumnWidths({});
        // Reset pagination
        setCurrentPage(1);
    }, [result]);

    // Close context menu on global click or custom event
    useEffect(() => {
        const handleClickOutside = () => setCellContextMenu(null);
        const handleCloseContextMenus = () => setCellContextMenu(null);
        if (cellContextMenu) {
            document.addEventListener('click', handleClickOutside);
            window.addEventListener('close-context-menus', handleCloseContextMenus);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
            window.removeEventListener('close-context-menus', handleCloseContextMenus);
        };
    }, [cellContextMenu]);

    if (isLoading) {
        return (
            <div className="empty-state">
                <div className="animate-spin" style={{ marginBottom: '16px' }}>
                    <Code size={32} color="var(--accent-primary)" />
                </div>
                <p className="empty-state-title">Executing query...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="empty-state">
                <div style={{
                    padding: '20px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                    border: '1px solid var(--error)',
                    maxWidth: '500px'
                }}>
                    <p style={{ color: 'var(--error)', fontWeight: 500, marginBottom: '8px' }}>Error</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{error}</p>
                </div>
            </div>
        );
    }

    if (!result) {
        return (
            <div className="empty-state">
                <Table size={48} className="empty-state-icon" />
                <p className="empty-state-title">Select a table to view data</p>
                <p className="empty-state-text">
                    Click on a table in the sidebar, or write a SQL query
                </p>
            </div>
        );
    }

    // Check for empty results (query executed but returned 0 rows)
    if (result.row_count === 0) {
        return (
            <div className="empty-state">
                <div style={{
                    padding: '24px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center'
                }}>
                    <Table size={40} color="var(--text-muted)" style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p className="empty-state-title" style={{ marginBottom: '8px' }}>No results found</p>
                    <p className="empty-state-text" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        The query executed successfully but returned no rows
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Execution time: {result.execution_time_ms}ms
                    </p>
                </div>
            </div>
        );
    }

    const handleFkClick = (tableName: string, value: any) => {
        if (onNavigateToTable && value !== null) {
            onNavigateToTable(tableName, value);
        }
    };

    const toggleRowSelection = (index: number) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedRows(newSelected);
    };

    const selectAllRows = () => {
        if (!result) return;
        const currentSortedRows = getSortedRows();
        if (selectedRows.size === currentSortedRows.length) {
            setSelectedRows(new Set());
        } else {
            setSelectedRows(new Set(currentSortedRows.map((_, i) => i)));
        }
    };

    const copySelectedAsJSON = () => {
        if (!result) return;
        const rows = Array.from(selectedRows).map(i => sortedRows[i]);
        navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
        setCopyFeedback('json');
        setTimeout(() => setCopyFeedback(null), 2000);
    };

    const copySelectedAsCSV = () => {
        if (!result) return;
        const rows = Array.from(selectedRows).map(i => sortedRows[i]);
        const headers = result.columns.map(c => c.name).join(',');
        const csvRows = rows.map(row =>
            result.columns.map(col => {
                const val = row[col.name];
                if (val === null) return '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return String(val);
            }).join(',')
        );
        navigator.clipboard.writeText([headers, ...csvRows].join('\n'));
        setCopyFeedback('csv');
        setTimeout(() => setCopyFeedback(null), 2000);
    };

    // Sorting logic
    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortedRows = () => {
        if (!result) return [];
        // Use localRows if available (for in-memory edits), otherwise use result.rows
        const rowsToSort = localRows || result.rows;
        let rows = [...rowsToSort];
        if (sortConfig) {
            rows.sort((a, b) => {
                const aValue = a[sortConfig.key] as any;
                const bValue = b[sortConfig.key] as any;

                if (aValue === bValue) return 0;
                if (aValue === null) return 1;
                if (bValue === null) return -1;

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return rows;
    };

    const sortedRows = getSortedRows();

    // Pagination calculations
    const totalRows = sortedRows.length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const paginatedRows = sortedRows.slice(startIndex, endIndex);

    // Cell Context Menu Handlers
    const handleCellContextMenu = (e: React.MouseEvent, rowIndex: number, colKey: string, value: any) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event('close-context-menus'));
        setCellContextMenu({
            x: e.clientX,
            y: e.clientY,
            value,
            rowIndex,
            colKey
        });
    };

    const handleCopyCellJSON = () => {
        if (!cellContextMenu) return;
        navigator.clipboard.writeText(JSON.stringify(cellContextMenu.value, null, 2));
        setCellContextMenu(null);
    };

    const handleEditCell = (rowIndex: number, colKey: string, value: any) => {
        setEditingCell({
            rowIndex,
            colKey,
            value
        });
        setCellContextMenu(null);

        // Show feedback that edit mode started
        setCellEditFeedback({
            type: 'success',
            message: `Editing "${colKey}"...`
        });
        setTimeout(() => setCellEditFeedback(null), 1500);
    };

    const handleSaveEdit = async (newValue: any) => {
        if (!editingCell) return;

        const oldValue = editingCell.value;
        const hasChanged = String(oldValue) !== String(newValue);

        if (hasChanged) {
            // Update local rows to reflect the change immediately in the UI
            setLocalRows(prev => {
                if (!prev) return prev;
                const newRows = [...prev];
                if (newRows[editingCell.rowIndex]) {
                    newRows[editingCell.rowIndex] = {
                        ...newRows[editingCell.rowIndex],
                        [editingCell.colKey]: newValue
                    };
                }
                return newRows;
            });

            // Execute actual DB update if we have connection info
            if (connectionId && tableName && localRows) {
                const row = localRows[editingCell.rowIndex];
                // Try to find primary key (usually 'id')
                const pkValue = row['id'] ?? row['ID'] ?? row['Id'];

                if (pkValue !== undefined) {
                    try {
                        // Escape the value properly
                        const escapedValue = typeof newValue === 'string'
                            ? `'${newValue.replace(/'/g, "''")}'`
                            : newValue === null ? 'NULL' : newValue;

                        const escapedPk = typeof pkValue === 'string'
                            ? `'${pkValue.replace(/'/g, "''")}'`
                            : pkValue;

                        const sql = `UPDATE ${tableName} SET ${editingCell.colKey} = ${escapedValue} WHERE id = ${escapedPk}`;

                        await executeQuery(connectionId, sql);

                        setCellEditFeedback({
                            type: 'success',
                            message: `✓ Saved to database: "${editingCell.colKey}" = "${newValue}"`
                        });
                    } catch (err) {
                        // Revert local change on error
                        setLocalRows(prev => {
                            if (!prev) return prev;
                            const newRows = [...prev];
                            if (newRows[editingCell.rowIndex]) {
                                newRows[editingCell.rowIndex] = {
                                    ...newRows[editingCell.rowIndex],
                                    [editingCell.colKey]: oldValue
                                };
                            }
                            return newRows;
                        });

                        setCellEditFeedback({
                            type: 'error',
                            message: `✕ Error: ${String(err)}`
                        });
                    }
                } else {
                    // No primary key found, just show local update message
                    setCellEditFeedback({
                        type: 'success',
                        message: `✓ Updated locally (no PK found for DB save)`
                    });
                }
            } else {
                // No connection/table info, show local update
                setCellEditFeedback({
                    type: 'success',
                    message: `✓ "${editingCell.colKey}" updated (local only)`
                });
            }
        } else {
            // No changes made
            setCellEditFeedback({
                type: 'cancel',
                message: 'No changes were made'
            });
        }

        setEditingCell(null);

        // Clear feedback after 3 seconds
        setTimeout(() => setCellEditFeedback(null), 3000);
    };

    const handleCancelEdit = () => {
        setCellEditFeedback({
            type: 'cancel',
            message: '✕ Edit cancelled'
        });
        setEditingCell(null);

        // Clear feedback after 2 seconds
        setTimeout(() => setCellEditFeedback(null), 2000);
    };

    // Column resize handler
    const handleColumnResize = (colName: string, startX: number, startWidth: number) => {
        const onMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(60, startWidth + delta);
            setColumnWidths(prev => ({ ...prev, [colName]: newWidth }));
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // Helper to render sort icon
    const renderSortIcon = (col: string) => {
        if (!sortConfig || sortConfig.key !== col) {
            return <div style={{ width: 14, height: 14, opacity: 0 }} />; // Placeholder
        }
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
    };

    const renderCellValue = (col: string, value: any, rowIndex: number) => {
        // Check if this cell is being edited
        if (editingCell && editingCell.rowIndex === rowIndex && editingCell.colKey === col) {

            // Determine the input type based on column type from result
            const colInfo = result?.columns.find(c => c.name === col);
            const dataType = colInfo?.type_name?.toLowerCase() || '';

            // Determine input type and attributes based on data type
            let inputType = 'text';
            let inputProps: any = {};

            if (dataType.includes('int') || dataType.includes('serial') || dataType.includes('bigint')) {
                inputType = 'number';
                inputProps.step = '1';
            } else if (dataType.includes('decimal') || dataType.includes('numeric') || dataType.includes('float') || dataType.includes('double') || dataType.includes('real')) {
                inputType = 'number';
                inputProps.step = 'any';
            } else if (dataType.includes('bool') || dataType.includes('bit')) {
                // Render checkbox for boolean
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            autoFocus
                            type="checkbox"
                            className="cell-editor"
                            defaultChecked={value === true || value === 1 || value === '1' || value === 't' || value === 'true'}
                            onClick={(e) => e.stopPropagation()}
                            id={`edit-input-${rowIndex}-${col}`}
                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <button
                            className="edit-action-btn btn-success"
                            title="Confirm"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const input = document.getElementById(`edit-input-${rowIndex}-${col}`) as HTMLInputElement;
                                if (input) handleSaveEdit(input.checked ? 'true' : 'false');
                            }}
                            style={{ padding: '4px', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                        >
                            <Check size={14} />
                        </button>
                        <button
                            className="edit-action-btn btn-danger"
                            title="Discard"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                handleCancelEdit();
                            }}
                            style={{ padding: '4px', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            } else if (dataType.includes('date') && !dataType.includes('datetime') && !dataType.includes('timestamp')) {
                inputType = 'date';
            } else if (dataType.includes('time') && !dataType.includes('datetime') && !dataType.includes('timestamp')) {
                inputType = 'time';
            } else if (dataType.includes('datetime') || dataType.includes('timestamp')) {
                inputType = 'datetime-local';
            }

            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                        autoFocus
                        type={inputType}
                        className="cell-editor"
                        defaultValue={value !== null ? String(value) : ''}
                        {...inputProps}
                        onBlur={(e) => {
                            // Don't auto-save on blur if clicking the buttons
                            if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest('.edit-action-btn')) return;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(e.currentTarget.value);
                            if (e.key === 'Escape') handleCancelEdit();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ minWidth: '60px', flex: 1 }}
                        id={`edit-input-${rowIndex}-${col}`}
                    />
                    <button
                        className="edit-action-btn btn-success"
                        title="Confirm"
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur
                            const input = document.getElementById(`edit-input-${rowIndex}-${col}`) as HTMLInputElement;
                            if (input) handleSaveEdit(input.value);
                        }}
                        style={{ padding: '4px', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                    >
                        <Check size={14} />
                    </button>
                    <button
                        className="edit-action-btn btn-danger"
                        title="Discard"
                        onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur
                            handleCancelEdit();
                        }}
                        style={{ padding: '4px', height: '24px', width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            );
        }

        if (value === null) {
            return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>;
        }

        // Lazy Load Image Component for better performance
        const LazyImage = ({ src, maxHeight, onClick, alt }: { src: string, maxHeight: number, onClick: () => void, alt: string }) => {
            const [isLoaded, setIsLoaded] = useState(false);

            useEffect(() => {
                // Defer image rendering slightly to allow table layout to settle
                const timer = setTimeout(() => setIsLoaded(true), 50);
                return () => clearTimeout(timer);
            }, []);

            if (!isLoaded) {
                // Placeholder while "loading"
                return (
                    <div
                        style={{
                            height: maxHeight,
                            width: '60px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            border: '2px solid var(--text-muted)',
                            borderTopColor: 'transparent',
                            animation: 'spin 1s linear infinite'
                        }} />
                    </div>
                );
            }

            return (
                <img
                    src={src}
                    alt={alt}
                    style={{
                        maxWidth: '100%',
                        maxHeight: `${maxHeight}px`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: '1px solid var(--border-color)',
                        animation: 'fadeIn 0.3s ease'
                    }}
                    title="Click to expand"
                    onClick={onClick}
                />
            );
        };

        // ... inside ResultsPanel ...

        // Check for Base64 image (data URI format)
        if (typeof value === 'string' && isBase64Image(value)) {
            if (!showImagePreviews) {
                return <span className="text-muted" style={{ fontSize: '11px', fontFamily: 'monospace' }} title="Image hidden. Double click to see/edit value.">{value.substring(0, 35)}...</span>;
            }
            return (
                <div className="base64-preview">
                    <LazyImage
                        src={value}
                        maxHeight={maxImagePreviewHeight}
                        onClick={() => setExpandedImage(value)}
                        alt="Base64 image"
                    />
                </div>
            );
        }

        // Check for raw Base64 that might be an image
        if (typeof value === 'string' && isRawBase64(value)) {
            const imageType = detectImageType(value);
            if (imageType) {
                if (!showImagePreviews) {
                    return <span className="text-muted" style={{ fontSize: '11px', fontFamily: 'monospace' }} title="Image hidden. Double click to see/edit value.">{value.substring(0, 35)}...</span>;
                }
                const dataUri = `data:image/${imageType};base64,${value}`;
                return (
                    <div className="base64-preview">
                        <LazyImage
                            src={dataUri}
                            maxHeight={maxImagePreviewHeight}
                            onClick={() => setExpandedImage(dataUri)}
                            alt="Base64 image"
                        />
                    </div>
                );
            }
            // It's base64 but not an image
            return (
                <span
                    style={{
                        color: 'var(--warning)',
                        fontStyle: 'italic',
                        cursor: 'help'
                    }}
                    title={`Base64 data (${value.length} chars)`}
                >
                    [Base64: {value.length} bytes]
                </span>
            );
        }

        const fkTable = isForeignKeyColumn(col, tables);
        if (fkTable && onNavigateToTable) {
            return (
                <span
                    className="fk-link"
                    onClick={() => handleFkClick(fkTable, value)}
                    title={`View ${fkTable} where id = ${value}`}
                >
                    {String(value)}
                    <ExternalLink size={10} style={{ marginLeft: '4px', opacity: 0.6 }} />
                </span>
            );
        }

        if (typeof value === 'object') {
            return JSON.stringify(value);
        }

        return String(value);
    };

    return (
        <div className={`results-panel ${compact ? 'compact' : ''}`}>
            {/* Cell Edit Feedback Toast */}
            {cellEditFeedback && (
                <div className={`cell-edit-toast ${cellEditFeedback.type}`}>
                    <span className="toast-icon">
                        {cellEditFeedback.type === 'success' ? (
                            <Check size={14} />
                        ) : (
                            <X size={14} />
                        )}
                    </span>
                    <span className="toast-message">{cellEditFeedback.message}</span>
                </div>
            )}

            {/* Image Modal */}
            {expandedImage && (
                <div
                    className="modal-overlay"
                    style={{ zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}
                    onClick={() => setExpandedImage(null)}
                >
                    <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
                        <img
                            src={expandedImage}
                            alt="Expanded"
                            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                        />
                        <button
                            onClick={() => setExpandedImage(null)}
                            style={{
                                position: 'absolute',
                                top: '-40px',
                                right: '0',
                                background: 'none',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer'
                            }}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>
            )}

            {/* Cell Context Menu */}
            {cellContextMenu && (
                <div
                    className="context-menu"
                    style={{
                        top: cellContextMenu.y,
                        left: cellContextMenu.x,
                        position: 'fixed',
                        zIndex: 1000
                    }}
                >
                    <div className="context-menu-item" onClick={() => {
                        navigator.clipboard.writeText(String(cellContextMenu.value));
                        setCellContextMenu(null);
                    }}>
                        <Copy size={14} />
                        <span>Copy Value</span>
                    </div>
                    <div className="context-menu-item" onClick={handleCopyCellJSON}>
                        <Code size={14} />
                        <span>Copy as JSON</span>
                    </div>
                    <div className="context-menu-item" onClick={() => {
                        if (localRows && localRows[cellContextMenu.rowIndex]) {
                            const row = localRows[cellContextMenu.rowIndex];
                            navigator.clipboard.writeText(JSON.stringify(row, null, 2));
                        } else if (result?.rows[cellContextMenu.rowIndex]) {
                            const row = result.rows[cellContextMenu.rowIndex];
                            navigator.clipboard.writeText(JSON.stringify(row, null, 2));
                        }
                        setCellContextMenu(null);
                    }}>
                        <Copy size={14} />
                        <span>Copy Row</span>
                    </div>
                    <div className="context-menu-divider" />
                    <div className="context-menu-item" onClick={(e) => {
                        e.stopPropagation();
                        handleEditCell(cellContextMenu.rowIndex, cellContextMenu.colKey, cellContextMenu.value);
                    }}>
                        <Edit2 size={14} />
                        <span>Edit Value</span>
                    </div>
                </div>
            )}

            <div className="results-header">
                <div className="results-tabs">
                    {!compact && (
                        <button
                            className={`results-tab ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            <Table size={14} />
                            Table
                        </button>
                    )}
                    <button
                        className={`results-tab ${viewMode === 'card' ? 'active' : ''}`}
                        onClick={() => setViewMode('card')}
                    >
                        <div style={{ transform: 'rotate(90deg)' }}><Table size={14} /></div>
                        Card
                    </button>
                    <button
                        className={`results-tab ${viewMode === 'json' ? 'active' : ''}`}
                        onClick={() => setViewMode('json')}
                    >
                        <Code size={14} />
                        JSON
                    </button>
                </div>

                {/* Selection Actions */}
                {selectedRows.size > 0 && (
                    <div className="selection-actions">
                        <span className="selection-count">{selectedRows.size} selected</span>
                        <button onClick={copySelectedAsJSON} title="Copy as JSON">
                            {copyFeedback === 'json' ? (
                                <>
                                    <CheckSquare size={12} />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    JSON
                                </>
                            )}
                        </button>
                        <button onClick={copySelectedAsCSV} title="Copy as CSV">
                            {copyFeedback === 'csv' ? (
                                <>
                                    <CheckSquare size={12} />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Download size={12} />
                                    CSV
                                </>
                            )}
                        </button>
                    </div>
                )}

                <div className="results-info">
                    {result.row_count} rows • {result.execution_time_ms}ms
                    {result.truncated && (
                        <span style={{ color: 'var(--warning)', marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Result limited to 2000 rows to prevent freezing. Use LIMIT (MySQL/PostgreSQL/SQLite) or TOP (SQL Server) in your query to control this.">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)' }}></span>
                            Truncated
                        </span>
                    )}
                </div>
            </div>

            <div className="results-content">
                {viewMode === 'table' && (
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {/* Select All Checkbox */}
                                    <th style={{ width: '30px', textAlign: 'center' }}>
                                        <span
                                            className="row-checkbox"
                                            onClick={selectAllRows}
                                            title={selectedRows.size === result.rows.length ? "Deselect all" : "Select all"}
                                        >
                                            {selectedRows.size === result.rows.length ? (
                                                <CheckSquare size={14} />
                                            ) : (
                                                <Square size={14} />
                                            )}
                                        </span>
                                    </th>
                                    {result.columns.map((col, i) => {
                                        const fkTable = isForeignKeyColumn(col.name, tables);
                                        const resolvedFkTable = fkTable;
                                        const colWidth = columnWidths[col.name];
                                        return (
                                            <th
                                                key={i}
                                                className="sortable-th resizable-th"
                                                style={{
                                                    padding: '8px 12px',
                                                    background: 'var(--bg-secondary)',
                                                    borderBottom: '1px solid var(--border-color)',
                                                    borderRight: '1px solid var(--border-color)',
                                                    position: 'sticky',
                                                    top: 0,
                                                    zIndex: 10,
                                                    width: colWidth ? `${colWidth}px` : 'auto',
                                                    minWidth: colWidth ? `${colWidth}px` : '60px',
                                                    maxWidth: colWidth ? `${colWidth}px` : undefined
                                                }}
                                            >
                                                <div
                                                    className="th-content"
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                                                    onClick={() => handleSort(col.name)}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                                        <span className="th-name" style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                                            {col.name}
                                                            {fkTable && (
                                                                <ExternalLink size={10} style={{ marginLeft: '4px', opacity: 0.4 }} />
                                                            )}
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontFamily: 'monospace' }}>
                                                            {col.type_name}
                                                        </span>
                                                    </div>
                                                    {renderSortIcon(col.name)}
                                                </div>
                                                {resolvedFkTable && (
                                                    <div className="th-fk-ref" style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
                                                        → {resolvedFkTable}
                                                    </div>
                                                )}
                                                {/* Column Resize Handle */}
                                                <div
                                                    className="column-resize-handle"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        const th = e.currentTarget.parentElement;
                                                        const startWidth = th?.offsetWidth || 100;
                                                        handleColumnResize(col.name, e.clientX, startWidth);
                                                    }}
                                                />
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, pageIndex) => {
                                    const actualIndex = startIndex + pageIndex;
                                    return (
                                        <tr key={actualIndex} className={selectedRows.has(actualIndex) ? 'selected' : ''}>
                                            {/* Row Checkbox */}
                                            <td style={{ textAlign: 'center' }}>
                                                <span
                                                    className="row-checkbox"
                                                    onClick={() => toggleRowSelection(actualIndex)}
                                                >
                                                    {selectedRows.has(actualIndex) ? (
                                                        <CheckSquare size={14} />
                                                    ) : (
                                                        <Square size={14} />
                                                    )}
                                                </span>
                                            </td>
                                            {result.columns.map((col, j) => {
                                                const isContextActive = cellContextMenu && cellContextMenu.rowIndex === actualIndex && cellContextMenu.colKey === col.name;
                                                const colWidth = columnWidths[col.name];
                                                return (
                                                    <td
                                                        key={j}
                                                        className={isContextActive ? 'cell-context-active' : ''}
                                                        style={{
                                                            width: colWidth ? `${colWidth}px` : 'auto',
                                                            minWidth: colWidth ? `${colWidth}px` : undefined,
                                                            maxWidth: colWidth ? `${colWidth}px` : undefined,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis'
                                                        }}
                                                        onContextMenu={(e) => handleCellContextMenu(e, actualIndex, col.name, row[col.name])}
                                                        onDoubleClick={() => {
                                                            setEditingCell({ rowIndex: actualIndex, colKey: col.name, value: row[col.name] });
                                                        }}
                                                    >
                                                        {renderCellValue(col.name, row[col.name], actualIndex)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {viewMode === 'card' && (
                    <div className="card-view-container">
                        {paginatedRows.map((row, pageIndex) => {
                            const actualIndex = startIndex + pageIndex;
                            return (
                                <div key={actualIndex} className="record-card">
                                    {result.columns.map(col => (
                                        <div key={col.name} className="record-field">
                                            <div className="record-label">
                                                {col.name}
                                                <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                                                    {col.type_name}
                                                </span>
                                                {isForeignKeyColumn(col.name, tables) && <ExternalLink size={10} style={{ marginLeft: '4px', opacity: 0.4, display: 'inline' }} />}
                                            </div>
                                            <div className="record-value">
                                                {renderCellValue(col.name, row[col.name], actualIndex)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}

                {viewMode === 'json' && (
                    <JsonViewer data={paginatedRows} />
                )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="pagination-controls">
                    <div className="pagination-info">
                        Showing {startIndex + 1} - {endIndex} of {totalRows} rows
                    </div>
                    <div className="pagination-buttons">
                        <button
                            className="pagination-btn"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            title="First page"
                        >
                            <ChevronLeft size={14} />
                            <ChevronLeft size={14} style={{ marginLeft: -8 }} />
                        </button>
                        <button
                            className="pagination-btn"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            title="Previous page"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="pagination-page">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            className="pagination-btn"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            title="Next page"
                        >
                            <ChevronRight size={14} />
                        </button>
                        <button
                            className="pagination-btn"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            title="Last page"
                        >
                            <ChevronRight size={14} />
                            <ChevronRight size={14} style={{ marginLeft: -8 }} />
                        </button>
                    </div>
                    <div className="pagination-per-page">
                        <span>Rows per page:</span>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                        >
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={250}>250</option>
                            <option value={500}>500</option>
                            <option value={1000}>1000</option>
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsPanel;
