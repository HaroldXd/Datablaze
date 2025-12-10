import React, { useRef, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useConnectionStore } from '../../stores/connectionStore';

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
    onExecute: () => void;
    isDarkMode?: boolean;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, onExecute, isDarkMode = true }) => {
    const onExecuteRef = useRef(onExecute);
    const monacoRef = useRef<Monaco | null>(null);
    const completionProviderRef = useRef<any>(null);

    // Get tables from the store
    const tables = useConnectionStore((state) => state.tables);

    useEffect(() => {
        onExecuteRef.current = onExecute;
    }, [onExecute]);

    const handleEditorChange = (newValue: string | undefined) => {
        onChange(newValue || '');
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
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions: any[] = [];

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
                    'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'EXISTS', 'ANY', 'SOME',
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
                    { name: 'DATE', snippet: 'DATE(${1:datetime})', detail: 'Extract date' },
                    { name: 'YEAR', snippet: 'YEAR(${1:date})', detail: 'Extract year' },
                    { name: 'MONTH', snippet: 'MONTH(${1:date})', detail: 'Extract month' },
                    { name: 'DAY', snippet: 'DAY(${1:date})', detail: 'Extract day' },
                    { name: 'CAST', snippet: 'CAST(${1:value} AS ${2:type})', detail: 'Type conversion' },
                    { name: 'ROUND', snippet: 'ROUND(${1:number}, ${2:decimals})', detail: 'Round number' },
                    { name: 'ABS', snippet: 'ABS(${1:number})', detail: 'Absolute value' },
                    { name: 'LENGTH', snippet: 'LENGTH(${1:string})', detail: 'String length' },
                    { name: 'REPLACE', snippet: 'REPLACE(${1:string}, ${2:from}, ${3:to})', detail: 'Replace substring' },
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
