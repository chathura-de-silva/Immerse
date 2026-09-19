/**
 * gallery-sequencer.js
 * Manages the global sequential order of all media items on the page (feed or grid),
 * enabling desktop-style folder navigation across all posts with arrow keys.
 */

import { getHighestResolutionUrl } from '../utils/srcset-parser.js';
import { findClosestPost, findPostImages } from '../utils/dom-helpers.js';

export class GallerySequencer {
  constructor() {
    this.items = []; // Array of { id, img, post, url, width, height, postIndex, slideIndex }
    this.knownImgSet = new WeakSet();
    this.listeners = new Set();
  }

  /**
   * Rebuilds and synchronizes the sequence of all discoverable media on the page
   * sorted in visual reading order (top-to-bottom, left-to-right).
   *
   * @param {HTMLElement[]} rootElements
   * @returns {Array<Object>}
   */
  syncSequence(mediaEntries) {
    if (!mediaEntries || mediaEntries.length === 0) return this.items;

    // Filter valid visible elements in DOM
    const validEntries = mediaEntries.filter(entry => entry.img && document.body.contains(entry.img));

    // Sort entries by visual DOM position
    validEntries.sort((a, b) => {
      const rectA = (a.container || a.img).getBoundingClientRect();
      const rectB = (b.container || b.img).getBoundingClientRect();
      const topDiff = (rectA.top + window.scrollY) - (rectB.top + window.scrollY);
      if (Math.abs(topDiff) > 20) {
        return topDiff;
      }
      return (rectA.left + window.scrollX) - (rectB.left + window.scrollX);
    });

    const newSequence = [];
    const seenUrls = new Set();

    validEntries.forEach((entry, postIndex) => {
      const { img, container } = entry;
      const post = findClosestPost(container || img);
      const postImages = post ? findPostImages(post) : [img];

      if (postImages.length > 1) {
        // Carousel post: add each slide in order
        postImages.forEach((slideImg, slideIndex) => {
          const url = getHighestResolutionUrl(slideImg);
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            newSequence.push({
              id: `${postIndex}-${slideIndex}-${url.slice(-16)}`,
              img: slideImg,
              container: container || post,
              post,
              url,
              width: slideImg.naturalWidth || 1080,
              height: slideImg.naturalHeight || 1080,
              postIndex,
              slideIndex,
              totalSlides: postImages.length,
              isCarousel: true
            });
          }
        });
      } else {
        // Single post
        const url = getHighestResolutionUrl(img);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          newSequence.push({
            id: `${postIndex}-0-${url.slice(-16)}`,
            img,
            container: container || post,
            post,
            url,
            width: img.naturalWidth || 1080,
            height: img.naturalHeight || 1080,
            postIndex,
            slideIndex: 0,
            totalSlides: 1,
            isCarousel: false
          });
        }
      }
    });

    this.items = newSequence;
    this._notify();
    return this.items;
  }

  /**
   * Finds the sequential index corresponding to a specific image element or URL.
   *
   * @param {HTMLImageElement} targetImg
   * @returns {number} Index, or 0 if not found
   */
  findIndex(targetImg) {
    if (!targetImg || this.items.length === 0) return 0;

    const targetSrc = targetImg.currentSrc || targetImg.src || '';
    const index = this.items.findIndex(item => {
      if (item.img === targetImg) return true;
      if (targetSrc && item.url.includes(targetSrc)) return true;
      return false;
    });

    return index !== -1 ? index : 0;
  }

  /**
   * Returns item at index.
   * @param {number} index
   * @returns {Object|null}
   */
  getItem(index) {
    return this.items[index] || null;
  }

  /**
   * Total number of items in sequence.
   * @returns {number}
   */
  get length() {
    return this.items.length;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.items);
      } catch (e) {
        console.error('[GallerySequencer] Error in listener:', e);
      }
    }
  }
}
