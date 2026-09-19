/**
 * dom-helpers.js
 * Utility functions for DOM manipulation, element creation, and performance optimizations.
 */

/**
 * Creates an HTML element with convenient options.
 *
 * @param {string} tag
 * @param {Object} [options]
 * @param {string} [options.className]
 * @param {string} [options.id]
 * @param {string} [options.textContent]
 * @param {string} [options.innerHTML]
 * @param {Object<string, string>} [options.attributes]
 * @param {Object<string, string>} [options.dataset]
 * @param {Object<string, string>} [options.style]
 * @param {Object<string, Function>} [options.events]
 * @param {HTMLElement[]} [options.children]
 * @returns {HTMLElement}
 */
export function createElement(tag, options = {}) {
  const el = document.createElement(tag);

  if (options.className) el.className = options.className;
  if (options.id) el.id = options.id;
  if (options.textContent) el.textContent = options.textContent;
  if (options.innerHTML) el.innerHTML = options.innerHTML;

  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      el.setAttribute(key, value);
    }
  }

  if (options.dataset) {
    for (const [key, value] of Object.entries(options.dataset)) {
      el.dataset[key] = value;
    }
  }

  if (options.style) {
    Object.assign(el.style, options.style);
  }

  if (options.events) {
    for (const [evt, handler] of Object.entries(options.events)) {
      el.addEventListener(evt, handler);
    }
  }

  if (options.children && Array.isArray(options.children)) {
    for (const child of options.children) {
      if (child) el.appendChild(child);
    }
  }

  return el;
}

/**
 * Batches a function call via requestAnimationFrame to prevent layout thrashing.
 *
 * @param {Function} fn
 * @returns {Function}
 */
export function rafDebounce(fn) {
  let rafId = null;
  return function (...args) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      fn.apply(this, args);
    });
  };
}

/**
 * Traverses up the DOM to locate Instagram's post container element (article or main card).
 *
 * @param {HTMLElement} element
 * @returns {HTMLElement|null}
 */
export function findClosestPost(element) {
  if (!element) return null;
  return (
    element.closest('article') ||
    element.closest('div[role="dialog"]') ||
    element.closest('a[href*="/p/"]') ||
    element.closest('a[href*="/reel/"]') ||
    element.closest('div[role="presentation"]') ||
    element.parentElement
  );
}

/**
 * Finds all candidate image elements within a post or carousel.
 *
 * @param {HTMLElement} postContainer
 * @returns {HTMLImageElement[]}
 */
export function findPostImages(postContainer) {
  if (!postContainer) return [];

  // Instagram wraps images inside div._aagv or role="presentation"
  const imgs = Array.from(postContainer.querySelectorAll('img[src], img[srcset]'));

  // Filter out tiny avatars, icons, badges (under 120px)
  return imgs.filter(img => {
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    const isTiny = (w > 0 && w < 120) || (h > 0 && h < 120);
    // Ignore profile avatars
    const isAvatar = img.alt?.includes('profile picture') || img.closest('header') !== null;
    return !isTiny && !isAvatar;
  });
}
