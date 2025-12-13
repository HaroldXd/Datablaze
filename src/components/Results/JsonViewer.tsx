import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
    data: unknown;
    initialExpanded?: boolean;
    columnOrder?: string[]; // Optional column order to preserve DB column order
}

interface JsonNodeProps {
    keyName?: string;
    value: unknown;
    depth: number;
    isLast: boolean;
    columnOrder?: string[];
}

// Helper to order object keys according to columnOrder
function orderObjectKeys(obj: object, columnOrder?: string[]): [string, any][] {
    const entries = Object.entries(obj);

    if (!columnOrder || columnOrder.length === 0) {
        return entries;
    }

    // Create a map for quick lookup of column order index
    const orderMap = new Map<string, number>();
    columnOrder.forEach((col, index) => {
        orderMap.set(col.toLowerCase(), index);
    });

    // Sort entries by their order in columnOrder
    return entries.sort((a, b) => {
        const aIndex = orderMap.get(a[0].toLowerCase());
        const bIndex = orderMap.get(b[0].toLowerCase());

        // If both are in columnOrder, sort by their order
        if (aIndex !== undefined && bIndex !== undefined) {
            return aIndex - bIndex;
        }
        // If only one is in columnOrder, it comes first
        if (aIndex !== undefined) return -1;
        if (bIndex !== undefined) return 1;
        // If neither is in columnOrder, maintain original order
        return 0;
    });
}

const JsonNode: React.FC<JsonNodeProps> = ({ keyName, value, depth, isLast, columnOrder }) => {
    const [isExpanded, setIsExpanded] = useState(depth < 2);

    const indent = depth * 20;
    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);

    const getValueDisplay = () => {
        if (value === null) {
            return <span className="json-null">null</span>;
        }
        if (typeof value === 'string') {
            return <span className="json-string">"{value}"</span>;
        }
        if (typeof value === 'number') {
            return <span className="json-number">{value}</span>;
        }
        if (typeof value === 'boolean') {
            return <span className="json-boolean">{value ? 'true' : 'false'}</span>;
        }
        return null;
    };

    const comma = isLast ? '' : ',';

    if (!isObject) {
        return (
            <div className="json-line" style={{ paddingLeft: indent }}>
                {keyName !== undefined && (
                    <>
                        <span className="json-key">"{keyName}"</span>
                        <span className="json-colon">: </span>
                    </>
                )}
                {getValueDisplay()}
                <span className="json-comma">{comma}</span>
            </div>
        );
    }

    // Calculate length for display
    const length = isArray ? (value as unknown[]).length : Object.keys(value as object).length;
    const bracketOpen = isArray ? '[' : '{';
    const bracketClose = isArray ? ']' : '}';

    if (length === 0) {
        return (
            <div className="json-line" style={{ paddingLeft: indent }}>
                {keyName !== undefined && (
                    <>
                        <span className="json-key">"{keyName}"</span>
                        <span className="json-colon">: </span>
                    </>
                )}
                <span className="json-bracket">{bracketOpen}{bracketClose}</span>
                <span className="json-comma">{comma}</span>
            </div>
        );
    }

    // Get ordered entries for objects
    const orderedEntries = !isArray ? orderObjectKeys(value as object, columnOrder) : null;

    return (
        <div className="json-node">
            <div
                className="json-line json-expandable"
                style={{ paddingLeft: indent }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="json-expand-icon">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                {keyName !== undefined && (
                    <>
                        <span className="json-key">"{keyName}"</span>
                        <span className="json-colon">: </span>
                    </>
                )}
                <span className="json-bracket">{bracketOpen}</span>
                {!isExpanded && (
                    <>
                        <span className="json-collapsed">
                            {isArray ? ` ${length} items ` : ` ${length} keys `}
                        </span>
                        <span className="json-bracket">{bracketClose}</span>
                        <span className="json-comma">{comma}</span>
                    </>
                )}
            </div>

            {isExpanded && (
                <>
                    {isArray ? (
                        (value as unknown[]).map((item, index) => (
                            <JsonNode
                                key={index}
                                keyName={undefined}
                                value={item}
                                depth={depth + 1}
                                isLast={index === length - 1}
                                columnOrder={columnOrder}
                            />
                        ))
                    ) : (
                        orderedEntries!.map(([key, val], index) => (
                            <JsonNode
                                key={key}
                                keyName={key}
                                value={val}
                                depth={depth + 1}
                                isLast={index === length - 1}
                                columnOrder={columnOrder}
                            />
                        ))
                    )}
                    <div className="json-line" style={{ paddingLeft: indent }}>
                        <span className="json-bracket">{bracketClose}</span>
                        <span className="json-comma">{comma}</span>
                    </div>
                </>
            )}
        </div>
    );
};

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, columnOrder }) => {
    return (
        <div className="json-viewer-container">
            <JsonNode value={data} depth={0} isLast={true} columnOrder={columnOrder} />
        </div>
    );
};

export default JsonViewer;
