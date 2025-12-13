import React, { useRef, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useConnectionStore } from '../../stores/connectionStore';
import { TableInfo } from '../../lib/tauri';

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
    onExecute: () => void;
    isDarkMode?: boolean;
}

interface TableAlias {
    alias: string;
    tableName: string;
}

// Parse SQL to extract table aliases from JOINs and FROM clauses
function parseTableAliases(sql: string, tables: TableInfo[]): TableAlias[] {
    const aliases: TableAlias[] = [];
    const tableNames = tables.map(t => t.name.toLowerCase());

    // Patterns to match: 
    // - FROM table_name alias
    // - FROM table_name AS alias
    // - JOIN table_name alias
    // - JOIN table_name AS alias
    const patterns = [
        // FROM table alias (without AS)
        /FROM\s+(\w+)\s+(?!AS\b|WHERE\b|INNER\b|LEFT\b|RIGHT\b|FULL\b|CROSS\b|JOIN\b|ON\b|ORDER\b|GROUP\b|HAVING\b|LIMIT\b|OFFSET\b)(\w+)/gi,
        // FROM table AS alias
        /FROM\s+(\w+)\s+AS\s+(\w+)/gi,
        // JOIN table alias (without AS)
        /JOIN\s+(\w+)\s+(?!AS\b|ON\b)(\w+)/gi,
        // JOIN table AS alias
        /JOIN\s+(\w+)\s+AS\s+(\w+)/gi,
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(sql)) !== null) {
            const tableName = match[1];
            const alias = match[2];

            // Verify it's a real table
            if (tableNames.includes(tableName.toLowerCase()) && alias && alias.length > 0) {
                aliases.push({ alias: alias.toLowerCase(), tableName });
            }
        }
    }

    return aliases;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, onExecute, isDarkMode = true }) => {
    const onExecuteRef = useRef(onExecute);
    const monacoRef = useRef<Monaco | null>(null);
    const editorRef = useRef<any>(null);
    const completionProviderRef = useRef<any>(null);
    const pendingFetchRef = useRef<Set<string>>(new Set());

    // Get tables and column getter from the store
    const tables = useConnectionStore((state) => state.tables);
    const getTableColumns = useConnectionStore((state) => state.getTableColumns);
    const setTableStructure = useConnectionStore((state) => state.setTableStructure);
    const activeConnectionId = useConnectionStore((state) => state.activeConnectionId);

    useEffect(() => {
        onExecuteRef.current = onExecute;
    }, [onExecute]);

    const handleEditorChange = (newValue: string | undefined) => {
        onChange(newValue || '');
    };

    // Function to fetch table columns if not cached
    const fetchTableColumnsIfNeeded = async (tableName: string): Promise<string[]> => {
        const lowerName = tableName.toLowerCase();

        // Check if already cached
        const existing = getTableColumns(tableName);
        if (existing.length > 0) {
            return existing;
        }

        // Check if already fetching
        if (pendingFetchRef.current.has(lowerName)) {
            return [];
        }

        // Check if we have a connection
        if (!activeConnectionId) {
            return [];
        }

        // Fetch the structure
        pendingFetchRef.current.add(lowerName);
        try {
            const { getTableStructure } = await import('../../lib/tauri');
            const structure = await getTableStructure(activeConnectionId, tableName);
            setTableStructure(tableName, structure);
            return structure.columns.map(c => c.name);
        } catch (err) {
            console.error('Failed to fetch table structure for autocomplete:', err);
            return [];
        } finally {
            pendingFetchRef.current.delete(lowerName);
        }
    };

    // Register custom SQL completion provider
    useEffect(() => {
        if (!monacoRef.current) return;

        const monaco = monacoRef.current;

        // Dispose previous provider if exists
        if (completionProviderRef.current) {
            completionProviderRef.current.dispose();
        }

        // Register new completion provider
        completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
            provideCompletionItems: async (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions: any[] = [];

                // Get full text and current line for context
                const fullText = model.getValue();
                const lineContent = model.getLineContent(position.lineNumber);
                const textBeforeCursor = lineContent.substring(0, position.column - 1);

                // Parse table aliases from the current SQL
                const aliases = parseTableAliases(fullText, tables);

                // Check if we're typing after a dot (alias.column pattern)
                const dotMatch = textBeforeCursor.match(/(\w+)\.\s*$/);

                if (dotMatch) {
                    const prefix = dotMatch[1].toLowerCase();

                    // Check if it's a table alias
                    const aliasInfo = aliases.find(a => a.alias === prefix);
                    if (aliasInfo) {
                        // Fetch columns automatically if not cached
                        const columns = await fetchTableColumnsIfNeeded(aliasInfo.tableName);
                        columns.forEach(col => {
                            suggestions.push({
                                label: col,
                                kind: monaco.languages.CompletionItemKind.Field,
                                insertText: col,
                                range,
                                detail: `Column from ${aliasInfo.tableName}`,
                                documentation: `Column "${col}" from table "${aliasInfo.tableName}" (alias: ${aliasInfo.alias})`,
                                sortText: '0' + col, // Prioritize columns
                            });
                        });

                        // Also add wildcard
                        suggestions.push({
                            label: '*',
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: '*',
                            range,
                            detail: `All columns from ${aliasInfo.tableName}`,
                            sortText: '00*',
                        });

                        return { suggestions };
                    }

                    // Check if it's a direct table name
                    const table = tables.find(t => t.name.toLowerCase() === prefix);
                    if (table) {
                        // Fetch columns automatically if not cached
                        const columns = await fetchTableColumnsIfNeeded(table.name);
                        columns.forEach(col => {
                            suggestions.push({
                                label: col,
                                kind: monaco.languages.CompletionItemKind.Field,
                                insertText: col,
                                range,
                                detail: `Column from ${table.name}`,
                                documentation: `Column "${col}" from table "${table.name}"`,
                                sortText: '0' + col,
                            });
                        });

                        suggestions.push({
                            label: '*',
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: '*',
                            range,
                            detail: `All columns from ${table.name}`,
                            sortText: '00*',
                        });

                        return { suggestions };
                    }
                }

                // SQL Keywords
                const keywords = [
                    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
                    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
                    'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW',
                    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'FULL', 'CROSS', 'ON',
                    'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
                    'DISTINCT', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
                    'NULL', 'IS', 'TRUE', 'FALSE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
                    'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT',
                    'CONSTRAINT', 'CASCADE', 'RESTRICT', 'TRUNCATE', 'BEGIN', 'COMMIT', 'ROLLBACK',
                    'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'EXISTS', 'ANY', 'SOME', 'TOP',
                ];

                keywords.forEach(keyword => {
                    suggestions.push({
                        label: keyword,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range,
                        detail: 'SQL Keyword',
                    });
                });

                // SQL Functions
                const functions = [
                    { name: 'COUNT', snippet: 'COUNT(${1:*})', detail: 'Count rows' },
                    { name: 'SUM', snippet: 'SUM(${1:column})', detail: 'Sum values' },
                    { name: 'AVG', snippet: 'AVG(${1:column})', detail: 'Average value' },
                    { name: 'MIN', snippet: 'MIN(${1:column})', detail: 'Minimum value' },
                    { name: 'MAX', snippet: 'MAX(${1:column})', detail: 'Maximum value' },
                    { name: 'COALESCE', snippet: 'COALESCE(${1:value1}, ${2:value2})', detail: 'Return first non-null' },
                    { name: 'CONCAT', snippet: 'CONCAT(${1:str1}, ${2:str2})', detail: 'Concatenate strings' },
                    { name: 'SUBSTRING', snippet: 'SUBSTRING(${1:string}, ${2:start}, ${3:length})', detail: 'Extract substring' },
                    { name: 'TRIM', snippet: 'TRIM(${1:string})', detail: 'Remove whitespace' },
                    { name: 'UPPER', snippet: 'UPPER(${1:string})', detail: 'Convert to uppercase' },
                    { name: 'LOWER', snippet: 'LOWER(${1:string})', detail: 'Convert to lowercase' },
                    { name: 'NOW', snippet: 'NOW()', detail: 'Current timestamp' },
                    { name: 'GETDATE', snippet: 'GETDATE()', detail: 'Current date/time (SQL Server)' },
                    { name: 'DATE', snippet: 'DATE(${1:datetime})', detail: 'Extract date' },
                    { name: 'YEAR', snippet: 'YEAR(${1:date})', detail: 'Extract year' },
                    { name: 'MONTH', snippet: 'MONTH(${1:date})', detail: 'Extract month' },
                    { name: 'DAY', snippet: 'DAY(${1:date})', detail: 'Extract day' },
                    { name: 'CAST', snippet: 'CAST(${1:value} AS ${2:type})', detail: 'Type conversion' },
                    { name: 'CONVERT', snippet: 'CONVERT(${1:type}, ${2:value})', detail: 'Type conversion (SQL Server)' },
                    { name: 'ROUND', snippet: 'ROUND(${1:number}, ${2:decimals})', detail: 'Round number' },
                    { name: 'ABS', snippet: 'ABS(${1:number})', detail: 'Absolute value' },
                    { name: 'LENGTH', snippet: 'LENGTH(${1:string})', detail: 'String length' },
                    { name: 'LEN', snippet: 'LEN(${1:string})', detail: 'String length (SQL Server)' },
                    { name: 'REPLACE', snippet: 'REPLACE(${1:string}, ${2:from}, ${3:to})', detail: 'Replace substring' },
                    { name: 'ISNULL', snippet: 'ISNULL(${1:value}, ${2:replacement})', detail: 'Replace NULL (SQL Server)' },
                    { name: 'IFNULL', snippet: 'IFNULL(${1:value}, ${2:replacement})', detail: 'Replace NULL (MySQL)' },
                ];

                functions.forEach(fn => {
                    suggestions.push({
                        label: fn.name,
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: fn.snippet,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                        detail: fn.detail,
                        documentation: fn.detail,
                    });
                });

                // Table names from connected database
                tables.forEach(table => {
                    suggestions.push({
                        label: table.name,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: table.name,
                        range,
                        detail: `Table (${table.schema || 'public'})`,
                        documentation: `Table in schema ${table.schema || 'public'}`,
                    });
                });

                // Add detected aliases as suggestions
                aliases.forEach(alias => {
                    suggestions.push({
                        label: alias.alias,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: alias.alias,
                        range,
                        detail: `Alias for ${alias.tableName}`,
                        documentation: `Table alias "${alias.alias}" pointing to "${alias.tableName}". Type "${alias.alias}." to see columns.`,
                        sortText: '0' + alias.alias, // Prioritize aliases
                    });
                });

                // Common SQL snippets
                const snippets = [
                    {
                        label: 'select-all',
                        insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:condition};',
                        detail: 'Select all from table',
                        documentation: 'Basic SELECT statement with WHERE clause'
                    },
                    {
                        label: 'select-columns',
                        insertText: 'SELECT ${1:column1}, ${2:column2}\nFROM ${3:table_name}\nWHERE ${4:condition};',
                        detail: 'Select specific columns',
                        documentation: 'SELECT statement with specific columns'
                    },
                    {
                        label: 'select-join',
                        insertText: 'SELECT ${1:t1}.*, ${2:t2}.*\nFROM ${3:table1} ${1:t1}\nINNER JOIN ${4:table2} ${2:t2} ON ${1:t1}.${5:id} = ${2:t2}.${6:foreign_id};',
                        detail: 'Select with JOIN',
                        documentation: 'SELECT with INNER JOIN'
                    },
                    {
                        label: 'select-left-join',
                        insertText: 'SELECT ${1:t1}.*, ${2:t2}.*\nFROM ${3:table1} ${1:t1}\nLEFT JOIN ${4:table2} ${2:t2} ON ${1:t1}.${5:id} = ${2:t2}.${6:foreign_id};',
                        detail: 'Select with LEFT JOIN',
                        documentation: 'SELECT with LEFT JOIN'
                    },
                    {
                        label: 'select-count',
                        insertText: 'SELECT COUNT(*) FROM ${1:table_name};',
                        detail: 'Count rows',
                        documentation: 'Count all rows in table'
                    },
                    {
                        label: 'select-group',
                        insertText: 'SELECT ${1:column}, COUNT(*) as count\nFROM ${2:table_name}\nGROUP BY ${1:column}\nORDER BY count DESC;',
                        detail: 'Select with GROUP BY',
                        documentation: 'SELECT with grouping and count'
                    },
                    {
                        label: 'insert-row',
                        insertText: 'INSERT INTO ${1:table_name} (${2:column1}, ${3:column2})\nVALUES (${4:value1}, ${5:value2});',
                        detail: 'Insert a row',
                        documentation: 'INSERT single row'
                    },
                    {
                        label: 'update-row',
                        insertText: 'UPDATE ${1:table_name}\nSET ${2:column1} = ${3:value1}\nWHERE ${4:condition};',
                        detail: 'Update rows',
                        documentation: 'UPDATE statement with WHERE'
                    },
                    {
                        label: 'delete-row',
                        insertText: 'DELETE FROM ${1:table_name}\nWHERE ${2:condition};',
                        detail: 'Delete rows',
                        documentation: 'DELETE statement with WHERE'
                    },
                    {
                        label: 'create-table',
                        insertText: 'CREATE TABLE ${1:table_name} (\n    id SERIAL PRIMARY KEY,\n    ${2:column_name} ${3:data_type} NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
                        detail: 'Create table',
                        documentation: 'CREATE TABLE statement'
                    },
                    {
                        label: 'alter-add-column',
                        insertText: 'ALTER TABLE ${1:table_name}\nADD COLUMN ${2:column_name} ${3:data_type};',
                        detail: 'Add column',
                        documentation: 'ALTER TABLE to add column'
                    },
                    {
                        label: 'drop-table',
                        insertText: 'DROP TABLE IF EXISTS ${1:table_name};',
                        detail: 'Drop table',
                        documentation: 'DROP TABLE statement'
                    },
                ];

                snippets.forEach(snippet => {
                    suggestions.push({
                        label: snippet.label,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: snippet.insertText,
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range,
                        detail: snippet.detail,
                        documentation: snippet.documentation,
                    });
                });

                return { suggestions };
            },
            triggerCharacters: ['.', ' ', '('],
        });

        return () => {
            if (completionProviderRef.current) {
                completionProviderRef.current.dispose();
            }
        };
    }, [tables]);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        monacoRef.current = monaco;
        editorRef.current = editor;

        // Add Ctrl+Enter command
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            onExecuteRef.current();
        });

        // Initial registration of completions
        if (completionProviderRef.current) {
            completionProviderRef.current.dispose();
        }
    };

    return (
        <div style={{ height: '100%', width: '100%' }}>
            <Editor
                height="100%"
                defaultLanguage="sql"
                theme={isDarkMode ? "vs-dark" : "light"}
                value={value}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on',
                    padding: { top: 12, bottom: 12 },
                    renderLineHighlight: 'all',
                    cursorBlinking: 'smooth',
                    smoothScrolling: true,
                    contextmenu: true,
                    suggest: {
                        showKeywords: true,
                        showSnippets: true,
                        showClasses: true,
                        showFields: true,
                        showFunctions: true,
                        insertMode: 'replace',
                        filterGraceful: true,
                        snippetsPreventQuickSuggestions: false,
                    },
                    quickSuggestions: {
                        other: true,
                        comments: false,
                        strings: true,
                    },
                    suggestOnTriggerCharacters: true,
                    acceptSuggestionOnEnter: 'on',
                    tabCompletion: 'on',
                    wordBasedSuggestions: 'currentDocument',
                }}
            />
        </div>
    );
};

export default SqlEditor;
