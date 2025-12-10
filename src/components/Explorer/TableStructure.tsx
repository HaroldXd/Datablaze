import React from 'react';
import { ColumnInfo } from '../../lib/tauri';
import { Key } from 'lucide-react';

interface TableStructureProps {
    tableName: string;
    columns: ColumnInfo[];
}

export const TableStructure: React.FC<TableStructureProps> = ({ tableName, columns }) => {
    return (
        <div>
            <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '16px',
                color: 'var(--text-primary)'
            }}>
                {tableName} Structure
            </h3>

            <div className="column-list">
                {columns.map((col, index) => (
                    <div key={index} className="column-item">
                        <span className="column-name">
                            {col.is_primary_key && <Key size={12} color="var(--warning)" style={{ marginRight: '6px' }} />}
                            {col.name}
                        </span>
                        <span className="column-type">{col.data_type}</span>
                        {col.is_primary_key && <span className="column-badge pk">PK</span>}
                        {!col.is_nullable && <span className="column-badge">NOT NULL</span>}
                        {col.default_value && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                = {col.default_value}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TableStructure;
