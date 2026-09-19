/**
 * gallery-sequencer.js
 * Manages the sequential list of posts in the grid, where each post can contain
 * one or multiple carousel slides.
 */

import { getHighestResolutionUrl } from '../utils/srcset-parser.js';
import {
  findClosestPost,
  findPostImages,
  isLegitimatePostImage,
  isCarouselPost,
  getEstimatedSlideCount
} from '../utils/dom-helpers.js';

export class GallerySequencer {
  constructor() {
    this.posts = []; // Array of { id, postElement, tile, slides: [{ url, width, height, element }], isCarousel, totalSlides }
    this.listeners = new Set();
  }

  /**
   * Synchronizes and sorts all legitimate post tiles visible in the DOM
   * in visual reading order (top-to-bottom, left-to-right).
   * Preserves previously discovered slides across DOM unmounts.
   *
   * @param {Array<{img: HTMLImageElement, container: HTMLElement}>} mediaEntries
   * @returns {Array<Object>}
   */
  syncSequence(mediaEntries) {
    if (!mediaEntries || mediaEntries.length === 0) return this.posts;

    // Filter valid entries strictly inside post links or articles
    const validEntries = mediaEntries.filter(entry => {
      return entry.img && document.body.contains(entry.img) && isLegitimatePostImage(entry.img);
    });

    // Group images by their unique post container
    const postMap = new Map();

    for (const entry of validEntries) {
      const tile = entry.container || findClosestPost(entry.img);
      if (!tile) continue;
      if (tile.matches('a[href*="/reel"]') || tile.querySelector('a[href*="/reel"]')) continue;

      if (!postMap.has(tile)) {
        postMap.set(tile, {
          tile,
          images: []
        });
      }
      postMap.get(tile).images.push(entry.img);
    }

    // Sort post tiles by visual position on page
    const sortedTiles = Array.from(postMap.values()).sort((a, b) => {
      const rectA = a.tile.getBoundingClientRect();
      const rectB = b.tile.getBoundingClientRect();
      const topDiff = (rectA.top + window.scrollY) - (rectB.top + window.scrollY);
      if (Math.abs(topDiff) > 25) {
        return topDiff;
      }
      return (rectA.left + window.scrollX) - (rectB.left + window.scrollX);
    });

    const newPosts = [];

    sortedTiles.forEach((group, postIndex) => {
      const { tile } = group;
      const postImages = findPostImages(tile);

      // Check if we already have an existing post registered for this tile
      const existing = this.posts.find(p => p.tile === tile);
      const uniqueSlides = existing ? [...existing.slides] : [];
      const seenUrls = new Set(uniqueSlides.map(s => s.url));

      for (const imgEl of postImages) {
        const url = getHighestResolutionUrl(imgEl);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          uniqueSlides.push({
            url,
            width: imgEl.naturalWidth || 1080,
            height: imgEl.naturalHeight || 1080,
            element: imgEl
          });
        }
      }

      const isCarousel = (existing && existing.isCarousel) || uniqueSlides.length > 1 || isCarouselPost(tile);
      const estCount = getEstimatedSlideCount(tile);
      const totalSlides = Math.max(existing?.totalSlides || 0, estCount, uniqueSlides.length);

      if (uniqueSlides.length > 0) {
        newPosts.push({
          id: existing?.id || `post-${postIndex}-${uniqueSlides[0].url.slice(-12)}`,
          tile,
          slides: uniqueSlides,
          isCarousel,
          totalSlides
        });
      }
    });

    this.posts = newPosts;
    this._notify();
    return this.posts;
  }

  /**
   * Appends a newly discovered slide to a specific post without duplicating.
   *
   * @param {Object} post
   * @param {Object} slide
   * @returns {Object}
   */
  appendSlide(post, slide) {
    if (!post || !slide || !slide.url) return post;
    if (!post.slides.some(s => s.url === slide.url)) {
      post.slides.push(slide);
      post.isCarousel = true;
      post.totalSlides = Math.max(post.totalSlides || 0, post.slides.length);
      this._notify();
    }
    return post;
  }

  /**
   * Finds the post index and slide index for a clicked image.
   *
   * @param {HTMLImageElement} targetImg
   * @returns {{postIndex: number, slideIndex: number}}
   */
  findLocation(targetImg) {
    if (!targetImg || this.posts.length === 0) {
      return { postIndex: 0, slideIndex: 0 };
    }

    const targetSrc = targetImg.currentSrc || targetImg.src || '';

    for (let pIdx = 0; pIdx < this.posts.length; pIdx++) {
      const post = this.posts[pIdx];
      for (let sIdx = 0; sIdx < post.slides.length; sIdx++) {
        const slide = post.slides[sIdx];
        if (slide.element === targetImg || (targetSrc && slide.url.includes(targetSrc))) {
          return { postIndex: pIdx, slideIndex: sIdx };
        }
      }
    }

    // Fallback: check if targetImg is inside the post's tile
    const foundTileIdx = this.posts.findIndex(p => p.tile.contains(targetImg));
    if (foundTileIdx !== -1) {
      return { postIndex: foundTileIdx, slideIndex: 0 };
    }

    return { postIndex: 0, slideIndex: 0 };
  }

  get length() {
    return this.posts.length;
  }

  getPost(index) {
    return this.posts[index] || null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.posts);
      } catch (e) {
        console.error('[GallerySequencer] Listener error:', e);
      }
    }
  }
}
