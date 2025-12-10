import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';

interface SqlEditorProps {
    value: string;
    onChange: (value: string) => void;
    onExecute: () => void;
    isDarkMode?: boolean;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({ value, onChange, onExecute, isDarkMode = true }) => {
    const onExecuteRef = useRef(onExecute);

    useEffect(() => {
        onExecuteRef.current = onExecute;
    }, [onExecute]);

    const handleEditorChange = (newValue: string | undefined) => {
        onChange(newValue || '');
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            onExecuteRef.current();
        });
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
                    },
                }}
            />
        </div>
    );
};

export default SqlEditor;
