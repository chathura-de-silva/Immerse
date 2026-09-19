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
  isLegitimatePhotoPost,
  isCarouselPost,
  getEstimatedSlideCount
} from '../utils/dom-helpers.js';

/**
 * Resolves a unique persistent identifier for an Instagram post tile.
 *
 * @param {HTMLElement} tile
 * @param {string} [fallbackUrl]
 * @returns {string}
 */
function getPostIdentifier(tile, fallbackUrl = '') {
  if (tile) {
    const permalink = (tile.matches && tile.matches('a[href*="/p/"]'))
      ? tile.getAttribute('href')
      : (tile.querySelector ? tile.querySelector('a[href*="/p/"]')?.getAttribute('href') : null);
    if (permalink) {
      const match = permalink.match(/\/p\/([a-zA-Z0-9_-]+)/);
      if (match) return `post_${match[1]}`;
    }
  }

  if (fallbackUrl) {
    const fileMatch = fallbackUrl.match(/\/([^\/?#]+)\.jpg/);
    if (fileMatch) return `asset_${fileMatch[1]}`;
    return `url_${fallbackUrl.slice(0, 100)}`;
  }

  return `tile_${Math.random().toString(36).slice(2, 9)}`;
}

export class GallerySequencer {
  constructor() {
    this.posts = []; // Array of { id, tile, slides: [{ url, width, height, element }], isCarousel, totalSlides }
    this.listeners = new Set();
  }

  /**
   * Synchronizes and accumulates legitimate post tiles in visual reading order.
   * Preserves previously discovered posts and slides across Instagram's virtual list unmounts.
   *
   * @param {Array<{img: HTMLImageElement, container: HTMLElement}>} mediaEntries
   * @returns {Array<Object>}
   */
  syncSequence(mediaEntries) {
    if (!mediaEntries || mediaEntries.length === 0) return this.posts;

    // Filter valid entries strictly inside legitimate photo posts
    const validEntries = mediaEntries.filter(entry => {
      return entry.img && isLegitimatePostImage(entry.img);
    });

    // Group images by their unique post container
    const postMap = new Map();

    for (const entry of validEntries) {
      const tile = entry.container || findClosestPost(entry.img);
      if (!tile || !isLegitimatePhotoPost(tile)) continue;

      if (!postMap.has(tile)) {
        postMap.set(tile, { tile, images: [] });
      }
      postMap.get(tile).images.push(entry.img);
    }

    // Sort currently mounted post tiles by visual position on page (top-to-bottom, left-to-right)
    const sortedTiles = Array.from(postMap.values()).sort((a, b) => {
      const rectA = a.tile.getBoundingClientRect();
      const rectB = b.tile.getBoundingClientRect();
      const topDiff = (rectA.top + window.scrollY) - (rectB.top + window.scrollY);
      if (Math.abs(topDiff) > 25) {
        return topDiff;
      }
      return (rectA.left + window.scrollX) - (rectB.left + window.scrollX);
    });

    let hasNewPosts = false;

    for (const group of sortedTiles) {
      const { tile } = group;
      const postImages = findPostImages(tile);
      if (postImages.length === 0) continue;

      const firstUrl = getHighestResolutionUrl(postImages[0]) || '';
      const postId = getPostIdentifier(tile, firstUrl);

      // Locate existing entry by DOM node, post ID, or slide URL overlap
      let existing = this.posts.find(p => p.id === postId || p.tile === tile);
      if (!existing && firstUrl) {
        existing = this.posts.find(p => p.slides.some(s => s.url === firstUrl));
      }

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

      if (uniqueSlides.length === 0) continue;

      const isCarousel = (existing && existing.isCarousel) || uniqueSlides.length > 1 || isCarouselPost(tile);
      const estCount = getEstimatedSlideCount(tile);
      const totalSlides = Math.max(existing?.totalSlides || 0, estCount, uniqueSlides.length);

      if (existing) {
        // Update in-place without altering its established index in the sequence
        existing.tile = tile;
        existing.slides = uniqueSlides;
        existing.isCarousel = isCarousel;
        existing.totalSlides = totalSlides;
      } else {
        // Append newly discovered post to the sequence
        this.posts.push({
          id: postId,
          tile,
          slides: uniqueSlides,
          isCarousel,
          totalSlides
        });
        hasNewPosts = true;
      }
    }

    if (hasNewPosts) {
      this._notify();
    }

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
