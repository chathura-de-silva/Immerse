/**
 * dom-helpers.js
 * Utility functions for DOM manipulation, element creation, and Instagram post traversal.
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
 * Strict validator that checks if an image is a genuine post/grid photo,
 * explicitly rejecting profile avatars, hovercard popups, story rings, and icons.
 *
 * @param {HTMLImageElement} img
 * @returns {boolean}
 */
export function isLegitimatePostImage(img) {
  if (!img || img.tagName !== 'IMG') return false;

  const src = img.currentSrc || img.src || '';
  if (!src) return false;

  // 1. Must be hosted on Instagram/Meta CDN
  if (!src.includes('cdninstagram') && !src.includes('fbcdn') && !src.includes('instagram')) {
    return false;
  }

  // 2. Reject avatars, story bubbles, and profile pictures
  const alt = (img.alt || '').toLowerCase();
  if (alt.includes('profile picture') || alt.includes('avatar') || alt.includes('story')) {
    return false;
  }

  // 3. Reject images inside headers, navbars, sidebars, or tooltip/hovercard dialogs
  if (img.closest('header, nav, aside, div[role="tooltip"], div[role="menu"]')) {
    return false;
  }

  // 4. Reject tiny UI icons or avatar thumbnails
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  if ((w > 0 && w < 160) || (h > 0 && h < 160)) {
    return false;
  }

  // 5. Must reside within a legitimate post link or article
  const postLink = img.closest('a[href*="/p/"], a[href*="/reel/"], article');
  if (!postLink) {
    return false;
  }

  return true;
}

/**
 * Traverses up the DOM to locate Instagram's post container element.
 * Only matches legitimate post links (a[href*="/p/"]) or post articles.
 *
 * @param {HTMLElement} element
 * @returns {HTMLElement|null}
 */
export function findClosestPost(element) {
  if (!element) return null;
  return (
    element.closest('a[href*="/p/"]') ||
    element.closest('a[href*="/reel/"]') ||
    element.closest('article') ||
    element.closest('div[role="dialog"] a[href*="/p/"]')
  );
}

/**
 * Finds all candidate post images within a post container.
 *
 * @param {HTMLElement} postContainer
 * @returns {HTMLImageElement[]}
 */
export function findPostImages(postContainer) {
  if (!postContainer) return [];

  const imgs = Array.from(postContainer.querySelectorAll('img[src], img[srcset]'));
  return imgs.filter(isLegitimatePostImage);
}
