/**
 * content.js
 * Main entry point for the Immerse Instagram extension.
 * Connects MediaDetector, HoverButtonManager, ViewerOverlay, and SettingsStore.
 */

import { settingsStore } from './modules/settings-store.js';
import { ViewerOverlay } from './modules/viewer-overlay.js';
import { HoverButtonManager } from './modules/hover-button.js';
import { MediaDetector } from './modules/media-detector.js';

class ImmerseApp {
  constructor() {
    this.overlay = null;
    this.hoverButtons = null;
    this.mediaDetector = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // Load user preferences
    const settings = await settingsStore.init();

    // Instantiate Lightbox Overlay
    this.overlay = new ViewerOverlay(settings);

    // Instantiate Hover Button Manager
    this.hoverButtons = new HoverButtonManager({
      onTrigger: (img, container) => this.handleTrigger(img, container),
      getSettings: () => settingsStore.get()
    });

    // Instantiate Media Detector
    this.mediaDetector = new MediaDetector({
      onMediaFound: (img, container) => {
        const currentSettings = settingsStore.get();
        if (currentSettings.enabled) {
          this.hoverButtons.attach(img, container);
        }
      }
    });

    // Listen for preference changes from popup
    settingsStore.subscribe((newSettings) => {
      this.handleSettingsChange(newSettings);
    });

    // Listen for extension messages (popup / background)
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GET_STATUS') {
          sendResponse({
            active: true,
            settings: settingsStore.get(),
            overlayOpen: this.overlay?.isOpen || false
          });
        } else if (message.type === 'SETTINGS_CHANGED') {
          this.handleSettingsChange(message.settings);
          sendResponse({ success: true });
        }
        return true; // Keep channel open
      });
    }

    // Start observing DOM if enabled
    if (settings.enabled) {
      this.mediaDetector.start();
    }

    this.initialized = true;
    console.log('[Immerse] Instagram High-Resolution Extension loaded.');
  }

  /**
   * Handles opening the fullscreen overlay when a trigger (button or image) is activated.
   *
   * @param {HTMLImageElement} targetImg
   * @param {HTMLElement} container
   */
  handleTrigger(targetImg, container) {
    const settings = settingsStore.get();
    if (!settings.enabled) return;

    const items = this.mediaDetector.resolvePostMediaItems(targetImg, container);

    // Find index of targeted image
    let initialIndex = 0;
    if (items.length > 1) {
      const targetSrc = targetImg.currentSrc || targetImg.src;
      const foundIdx = items.findIndex(item => item.originalElement === targetImg || (targetSrc && item.url.includes(targetSrc)));
      if (foundIdx !== -1) {
        initialIndex = foundIdx;
      }
    }

    this.overlay.open(items, initialIndex);
  }

  handleSettingsChange(newSettings) {
    if (newSettings.enabled) {
      this.mediaDetector.start();
    } else {
      this.mediaDetector.stop();
      if (this.overlay?.isOpen) {
        this.overlay.close();
      }
    }
  }
}

// Initialize on document ready
const app = new ImmerseApp();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
