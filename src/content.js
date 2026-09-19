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

    // Instantiate Lightbox Overlay with infinite feed loading hook and close callback
    this.overlay = new ViewerOverlay({
      ...settings,
      onLoadMore: () => this.handleLoadMore(),
      onClose: () => this.handleClose()
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
          for (const [k, v] of Object.entries(message.settings || {})) {
            settingsStore.set(k, v);
          }
          this.handleSettingsChange(settingsStore.get());
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

    // Preserve the user's current scroll position so we can restore it on close
    this.savedScrollY = window.scrollY;

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

  /**
   * Restores user's scroll position when overlay closes, preventing feed jumps.
   */
  handleClose() {
    if (typeof this.savedScrollY === 'number') {
      window.scrollTo({ top: this.savedScrollY, behavior: 'instant' });
    }
  }

  handleSettingsChange(newSettings) {
    const current = settingsStore.get();
    const merged = { ...current, ...newSettings };

    if (merged.enabled) {
      this.mediaDetector.start();
    } else {
      this.mediaDetector.stop();
      if (this.overlay?.isOpen) {
        this.overlay.close();
      }
      this.hoverButtons.hideAll();
    }

    // Forward updated settings directly to overlay
    if (this.overlay) {
      this.overlay.updateSettings(merged);
    }
  }

  /**
   * Safely nudges Instagram's native feed/grid infinite scroll to load the next batch of posts
   * without jumping violently to the bottom of the page or causing virtual list disruptions.
   */
  handleLoadMore() {
    if (this._isLoadingMore) return;
    this._isLoadingMore = true;

    // Gently nudge scroll down by 1.2 viewports
    const scrollStep = Math.round(window.innerHeight * 1.2);
    window.scrollBy({ top: scrollStep, behavior: 'smooth' });
    window.dispatchEvent(new Event('scroll', { bubbles: true }));

    const mainEl = document.querySelector('main') || document.querySelector('div[role="main"]');
    if (mainEl && mainEl.scrollHeight > mainEl.clientHeight) {
      mainEl.scrollBy({ top: scrollStep, behavior: 'smooth' });
      mainEl.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    // Cooldown prevents excessive scroll spam
    setTimeout(() => {
      this._isLoadingMore = false;
    }, 1500);
  }
}

// Initialize on document ready
const app = new ImmerseApp();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
