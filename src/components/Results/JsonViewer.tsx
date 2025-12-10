import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
    data: unknown;
    initialExpanded?: boolean;
}

interface JsonNodeProps {
    keyName?: string;
    value: unknown;
    depth: number;
    isLast: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({ keyName, value, depth, isLast }) => {
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
                            />
                        ))
                    ) : (
                        Object.entries(value as object).map(([key, val], index) => (
                            <JsonNode
                                key={key}
                                keyName={key}
                                value={val}
                                depth={depth + 1}
                                isLast={index === length - 1}
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

export const JsonViewer: React.FC<JsonViewerProps> = ({ data }) => {
    return (
        <div className="json-viewer-container">
            <JsonNode value={data} depth={0} isLast={true} />
        </div>
    );
};

export default JsonViewer;
