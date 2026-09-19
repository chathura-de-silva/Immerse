/**
 * media-detector.js
 * Strictly observes and discovers legitimate Instagram grid posts and feed articles.
 * Never attaches to profile avatars, story bubbles, or hovercard dialogs.
 */

import { getHighestResolutionUrl } from '../utils/srcset-parser.js';
import { findClosestPost, findPostImages, isLegitimatePostImage, isLegitimatePhotoPost } from '../utils/dom-helpers.js';

export class MediaDetector {
  /**
   * @param {Object} options
   * @param {(img: HTMLImageElement, container: HTMLElement) => void} options.onMediaFound
   */
  constructor({ onMediaFound }) {
    this.onMediaFound = onMediaFound;
    this.processedImages = new WeakSet();
    this.mediaEntries = []; // Array of { img, container }
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
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const node = mutation.addedNodes[i];
            if (node.nodeType === Node.ELEMENT_NODE) {
              this._pendingNodes.push(node);
              shouldScan = true;
            }
          }
        } else if (mutation.type === 'attributes' && mutation.target) {
          this._pendingNodes.push(mutation.target);
          shouldScan = true;
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
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset']
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
   * Scans a root element strictly for legitimate Instagram post and grid images.
   *
   * @param {HTMLElement} root
   */
  scan(root) {
    if (!root) return;

    // Direct image node check (e.g. hydrated src/srcset attribute mutation)
    if (root.tagName === 'IMG') {
      const tile = findClosestPost(root);
      if (tile && isLegitimatePhotoPost(tile) && isLegitimatePostImage(root)) {
        if (!this.processedImages.has(root)) {
          this.processedImages.add(root);
          this.mediaEntries.push({ img: root, container: tile });
          this.onMediaFound(root, tile);
        }
      }
      return;
    }

    if (!root.querySelectorAll) return;

    // Strict semantic selector targeting only photo post links and feed post articles (skipping reels)
    const postTiles = Array.from(root.querySelectorAll('a[href*="/p/"], article'));
    if (root.matches && (root.matches('a[href*="/p/"]') || root.tagName === 'ARTICLE')) {
      postTiles.push(root);
    }

    for (const tile of postTiles) {
      // Explicitly skip Instagram Reels, video posts, and Sponsored ads
      if (!isLegitimatePhotoPost(tile)) {
        continue;
      }

      // Find candidate images inside this tile
      const images = Array.from(tile.querySelectorAll('img[src], img[srcset]'));

      for (const img of images) {
        if (this.processedImages.has(img)) continue;

        // Strict validation: must be a legitimate post photo, not avatar or UI icon
        if (!isLegitimatePostImage(img)) continue;

        this.processedImages.add(img);

        // Record entry and notify
        this.mediaEntries.push({ img, container: tile });
        this.onMediaFound(img, tile);
      }
    }
  }

  /**
   * Returns all currently detected legitimate media entries.
   * @returns {Array<{img: HTMLImageElement, container: HTMLElement}>}
   */
  getMediaEntries() {
    return this.mediaEntries;
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
