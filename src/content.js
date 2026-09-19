/**
 * content.js
 * Main entry point for the Immerse Instagram extension.
 * Connects MediaDetector, HoverButtonManager, ViewerOverlay, GallerySequencer, and SettingsStore.
 */

import { settingsStore } from './modules/settings-store.js';
import { ViewerOverlay } from './modules/viewer-overlay.js';
import { HoverButtonManager } from './modules/hover-button.js';
import { MediaDetector } from './modules/media-detector.js';
import { GallerySequencer } from './modules/gallery-sequencer.js';

class ImmerseApp {
  constructor() {
    this.overlay = null;
    this.hoverButtons = null;
    this.mediaDetector = null;
    this.sequencer = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // Load user preferences
    const settings = await settingsStore.init();

    // Instantiate Gallery Sequencer for desktop folder-like navigation
    this.sequencer = new GallerySequencer();

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

          // If overlay is open, synchronize new images into the active sequence
          if (this.overlay?.isOpen) {
            const updatedItems = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());
            this.overlay.updateSequence(updatedItems);
          }
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
            overlayOpen: this.overlay?.isOpen || false,
            totalItems: this.sequencer?.length || 0
          });
        } else if (message.type === 'SETTINGS_CHANGED') {
          this.handleSettingsChange(message.settings);
          sendResponse({ success: true });
        }
        return true;
      });
    }

    // Start observing DOM if enabled
    if (settings.enabled) {
      this.mediaDetector.start();
    }

    this.initialized = true;
    console.log('[Immerse] Instagram High-Resolution Extension loaded with Liquid Glass UI.');
  }

  /**
   * Handles opening the fullscreen overlay with the complete page sequence.
   *
   * @param {HTMLImageElement} targetImg
   * @param {HTMLElement} container
   */
  handleTrigger(targetImg, container) {
    const settings = settingsStore.get();
    if (!settings.enabled) return;

    // Synchronize the complete sequence of all posts on the page
    const sequenceItems = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());

    if (sequenceItems.length > 0) {
      const initialIndex = this.sequencer.findIndex(targetImg);
      this.overlay.open(sequenceItems, initialIndex);
    } else {
      // Fallback to single post items if sequence was empty
      const items = this.mediaDetector.resolvePostMediaItems(targetImg, container);
      this.overlay.open(items, 0);
    }
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
