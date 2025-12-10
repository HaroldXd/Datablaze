import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import '../../index.css'; // Make sure we have access to variables

export const TitleBar = () => {
    const [isMaximized, setIsMaximized] = useState(false);
    const appWindow = getCurrentWindow();

    useEffect(() => {
        const checkMaximized = async () => {
            setIsMaximized(await appWindow.isMaximized());
        };

        checkMaximized();

        // Listen for resize events to update the state
        const unlisten = appWindow.listen('tauri://resize', checkMaximized);

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleMinimize = () => {
        appWindow.minimize();
    };

    const handleMaximize = async () => {
        await appWindow.toggleMaximize();
        setIsMaximized(await appWindow.isMaximized());
    };

    const handleClose = () => {
        appWindow.close();
    };

    return (
        <div
            className="titlebar"
            style={{
                height: '32px',
                background: 'var(--bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 0, /* Remove padding here, add to drag region if needed */
                borderBottom: '1px solid var(--border-color)',
                userSelect: 'none',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999
            }}
        >
            {/* Drag Region - This takes up all available space */}
            <div
                data-tauri-drag-region
                style={{
                    flex: 1,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '16px'
                }}
            >
                <div className="titlebar-title" style={{ fontSize: '12px', color: 'var(--text-secondary)', pointerEvents: 'none' }}>
                    Datablaze
                </div>
            </div>

            <div className="titlebar-controls" style={{ display: 'flex', height: '100%', zIndex: 10000 }}>
                {/* Buttons remain the same */}
                <div
                    className="titlebar-button"
                    onClick={handleMinimize}
                    title="Minimize"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '46px',
                        height: '100%',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                    }}
                >
                    <Minus size={16} />
                </div>
                <div
                    className="titlebar-button"
                    onClick={handleMaximize}
                    title="Maximize"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '46px',
                        height: '100%',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                    }}
                >
                    {isMaximized ? <Square size={14} fill="currentColor" style={{ opacity: 0.5 }} /> : <Square size={14} />}
                </div>
                <div
                    className="titlebar-button close-btn"
                    onClick={handleClose}
                    title="Close"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '46px',
                        height: '100%',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                    }}
                >
                    <X size={16} />
                </div>
            </div>
        </div>
    );
};
