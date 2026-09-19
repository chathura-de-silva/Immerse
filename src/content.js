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

    // Instantiate Gallery Sequencer for post and carousel slide organization
    this.sequencer = new GallerySequencer();

    // Instantiate Lightbox Overlay with infinite feed loading hook
    this.overlay = new ViewerOverlay({
      ...settings,
      onLoadMore: () => this.handleLoadMore()
    });

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

          // If overlay is open, synchronize newly loaded posts into the active gallery
          if (this.overlay?.isOpen) {
            const updatedPosts = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());
            this.overlay.updatePosts(updatedPosts);
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
            totalPosts: this.sequencer?.length || 0
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
    console.log('[Immerse] Instagram High-Resolution Extension loaded.');
  }

  /**
   * Handles opening the fullscreen overlay with the synchronized grid posts.
   *
   * @param {HTMLImageElement} targetImg
   * @param {HTMLElement} container
   */
  handleTrigger(targetImg, container) {
    const settings = settingsStore.get();
    if (!settings.enabled) return;

    // Synchronize all legitimate grid posts currently in DOM
    const posts = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());

    if (posts.length > 0) {
      const { postIndex, slideIndex } = this.sequencer.findLocation(targetImg);
      this.overlay.open(posts, postIndex, slideIndex);
    } else {
      // Fallback for single post
      const items = this.mediaDetector.resolvePostMediaItems(targetImg, container);
      this.overlay.open([{ id: 'post-0', tile: container, slides: items }], 0, 0);
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

  /**
   * Triggers background scrolling on the underlying page so Instagram loads the next batch of grid posts.
   */
  handleLoadMore() {
    const target = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    window.scrollTo({ top: target, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));

    // Check main container if present
    const mainEl = document.querySelector('main') || document.querySelector('div[role="main"]');
    if (mainEl && mainEl.scrollHeight > mainEl.clientHeight) {
      mainEl.scrollTop = mainEl.scrollHeight;
      mainEl.dispatchEvent(new Event('scroll'));
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
