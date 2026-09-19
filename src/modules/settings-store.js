/**
 * settings-store.js
 * Manages user preferences stored in chrome.storage.sync with local fallback.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  triggerMode: 'both', // 'both' | 'button-only' | 'image-click'
  showResolutionBadge: false,
  wheelZoom: true,
  transitionStyle: 'parallax', // 'parallax' | 'slide'
  autoMaxRes: true
});

class SettingsStore {
  constructor() {
    this.cache = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.initialized = false;
  }

  /**
   * Initializes the settings store by loading values from storage and listening for changes.
   * @returns {Promise<typeof DEFAULT_SETTINGS>}
   */
  async init() {
    if (this.initialized) return this.cache;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const storageArea = chrome.storage.sync || chrome.storage.local;
        const stored = await storageArea.get(DEFAULT_SETTINGS);
        this.cache = { ...DEFAULT_SETTINGS, ...stored };

        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'sync' || areaName === 'local') {
            for (const [key, change] of Object.entries(changes)) {
              if (key in this.cache) {
                this.cache[key] = change.newValue;
              }
            }
            this._notify(this.cache);
          }
        });
      }
    } catch (err) {
      console.warn('[Immerse] Failed to load settings from chrome.storage:', err);
    }

    this.initialized = true;
    return this.cache;
  }

  /**
   * Returns current settings.
   * @returns {typeof DEFAULT_SETTINGS}
   */
  get() {
    return { ...this.cache };
  }

  /**
   * Updates a specific setting.
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  async set(key, value) {
    this.cache[key] = value;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const storageArea = chrome.storage.sync || chrome.storage.local;
        await storageArea.set({ [key]: value });
      }
    } catch (err) {
      console.warn('[Immerse] Failed to save setting:', key, err);
    }
    this._notify(this.cache);
  }

  /**
   * Subscribes to settings updates.
   * @param {(settings: typeof DEFAULT_SETTINGS) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(updatedSettings) {
    for (const listener of this.listeners) {
      try {
        listener(updatedSettings);
      } catch (e) {
        console.error('[Immerse] Error in settings listener:', e);
      }
    }
  }
}

export const settingsStore = new SettingsStore();
