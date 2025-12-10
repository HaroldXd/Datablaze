import React, { useState, useEffect } from 'react';
import { Moon, Sun, Image, Database } from 'lucide-react';
import Modal from '../UI/Modal';

interface Settings {
    theme: 'dark' | 'light';
    showImagePreviews: boolean;
    maxImagePreviewHeight: number;
    defaultRowLimit: number;
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSave: (settings: Settings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    settings,
    onSave
}) => {
    const [localSettings, setLocalSettings] = useState<Settings>(settings);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="settings-content">
                {/* Appearance Section */}
                <div className="settings-section">
                    <h3 className="settings-section-title">
                        <Sun size={16} />
                        Appearance
                    </h3>

                    <div className="settings-row">
                        <label>Theme</label>
                        <div className="theme-toggle">
                            <button
                                className={`theme-btn ${localSettings.theme === 'dark' ? 'active' : ''}`}
                                onClick={() => setLocalSettings({ ...localSettings, theme: 'dark' })}
                            >
                                <Moon size={14} />
                                Dark
                            </button>
                            <button
                                className={`theme-btn ${localSettings.theme === 'light' ? 'active' : ''}`}
                                onClick={() => setLocalSettings({ ...localSettings, theme: 'light' })}
                            >
                                <Sun size={14} />
                                Light
                            </button>
                        </div>
                    </div>
                </div>

                {/* Data Display Section */}
                <div className="settings-section">
                    <h3 className="settings-section-title">
                        <Image size={16} />
                        Data Display
                    </h3>

                    <div className="settings-row">
                        <label>Show Image Previews</label>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={localSettings.showImagePreviews}
                                onChange={(e) => setLocalSettings({
                                    ...localSettings,
                                    showImagePreviews: e.target.checked
                                })}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    <div className="settings-row">
                        <label>Max Preview Height (px)</label>
                        <input
                            type="number"
                            className="form-input"
                            value={localSettings.maxImagePreviewHeight}
                            onChange={(e) => setLocalSettings({
                                ...localSettings,
                                maxImagePreviewHeight: parseInt(e.target.value) || 60
                            })}
                            min={20}
                            max={200}
                        />
                    </div>
                </div>

                {/* Query Section */}
                <div className="settings-section">
                    <h3 className="settings-section-title">
                        <Database size={16} />
                        Query Defaults
                    </h3>

                    <div className="settings-row">
                        <label>Default Row Limit</label>
                        <input
                            type="number"
                            className="form-input"
                            value={localSettings.defaultRowLimit}
                            onChange={(e) => setLocalSettings({
                                ...localSettings,
                                defaultRowLimit: parseInt(e.target.value) || 100
                            })}
                            min={10}
                            max={10000}
                        />
                    </div>
                </div>
            </div>

            <div className="modal-footer">
                <button className="btn btn-ghost" onClick={onClose}>
                    Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
                    Save Settings
                </button>
            </div>
        </Modal>
    );
};

export default SettingsModal;
