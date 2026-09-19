/**
 * media-detector.js
 * Observes and discovers Instagram feed posts, carousels, profile grid items, and explore items.
 */

import { getHighestResolutionUrl } from '../utils/srcset-parser.js';
import { findClosestPost, findPostImages } from '../utils/dom-helpers.js';

export class MediaDetector {
  /**
   * @param {Object} options
   * @param {(img: HTMLImageElement, container: HTMLElement) => void} options.onMediaFound
   */
  constructor({ onMediaFound }) {
    this.onMediaFound = onMediaFound;
    this.processedImages = new WeakSet();
    this.observer = null;
    this._rafScheduled = false;
    this._pendingNodes = [];
  }

  /**
   * Starts observing the DOM for media elements.
   */
  start() {
    this.scan(document.body);

    this.observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const node = mutation.addedNodes[i];
            if (node.nodeType === Node.ELEMENT_NODE) {
              this._pendingNodes.push(node);
              shouldScan = true;
            }
          }
        }
      }

      if (shouldScan && !this._rafScheduled) {
        this._rafScheduled = true;
        requestAnimationFrame(() => {
          this._processPendingNodes();
          this._rafScheduled = false;
        });
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Stops the mutation observer.
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this._pendingNodes = [];
  }

  _processPendingNodes() {
    const nodes = this._pendingNodes.splice(0, this._pendingNodes.length);
    for (const node of nodes) {
      this.scan(node);
    }
  }

  /**
   * Scans a root element for Instagram images.
   *
   * @param {HTMLElement} root
   */
  scan(root) {
    if (!root || !root.querySelectorAll) return;

    // Selector covering feed items, profile grid, explore grid, and post dialogs
    const selector = 'article img, div._aagv img, a[href^="/p/"] img, a[href^="/reel/"] img, div[role="dialog"] img';
    const images = Array.from(root.querySelectorAll(selector));

    if (root.tagName === 'IMG' && root.matches(selector)) {
      images.push(root);
    }

    for (const img of images) {
      if (this.processedImages.has(img)) continue;

      // Filter out avatars, icons, and small UI thumbnails
      const isAvatar = img.alt?.toLowerCase().includes('profile picture') ||
                       img.closest('header') !== null ||
                       img.width < 120 && img.width > 0;

      if (isAvatar) continue;

      this.processedImages.add(img);

      // Find the visual wrapper to anchor the button
      const container = img.closest('div._aagv') ||
                        img.closest('div[role="button"]') ||
                        img.closest('a[href^="/p/"]') ||
                        img.parentElement;

      if (container) {
        this.onMediaFound(img, container);
      }
    }
  }

  /**
   * Resolves all media items in the same post or carousel for the given image.
   *
   * @param {HTMLImageElement} img
   * @param {HTMLElement} [container]
   * @returns {Array<{url: string, width?: number, height?: number}>}
   */
  resolvePostMediaItems(img, container) {
    const postContainer = findClosestPost(container || img);
    if (!postContainer) {
      return [{ url: getHighestResolutionUrl(img), originalElement: img }];
    }

    const postImages = findPostImages(postContainer);
    if (postImages.length <= 1) {
      return [{ url: getHighestResolutionUrl(img), originalElement: img }];
    }

    // Map each image to highest resolution URL
    const items = [];
    const seenUrls = new Set();

    for (const imageEl of postImages) {
      const url = getHighestResolutionUrl(imageEl);
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        items.push({
          url,
          width: imageEl.naturalWidth || 1080,
          height: imageEl.naturalHeight || 1080,
          originalElement: imageEl
        });
      }
    }

    return items.length > 0 ? items : [{ url: getHighestResolutionUrl(img), originalElement: img }];
  }
}
