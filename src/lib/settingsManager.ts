

const SETTINGS_KEY = 'datablaze_settings';


export interface AppSettings {
    theme: 'dark' | 'light';
    showImagePreviews: boolean;
    maxImagePreviewHeight: number;
    defaultRowLimit: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
    theme: 'dark',
    showImagePreviews: true,
    maxImagePreviewHeight: 60,
    defaultRowLimit: 100
};

export class SettingsManager {
    static getSettings(): AppSettings {
        try {
            const data = localStorage.getItem(SETTINGS_KEY);
            if (data) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        return DEFAULT_SETTINGS;
    }

    static saveSettings(settings: AppSettings): void {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            // Dispatch event for other components to listen
            window.dispatchEvent(new Event('settings-changed'));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }
}
