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

  // 5. Explicitly reject Instagram Reels (videos)
  if (img.closest('a[href*="/reel"]')) {
    return false;
  }

  // 6. Must reside within a legitimate photo post link or article
  const postLink = img.closest('a[href*="/p/"], article');
  if (!postLink) {
    return false;
  }

  if (postLink.matches('a[href*="/reel"]') || postLink.querySelector('a[href*="/reel"]')) {
    return false;
  }

  return true;
}

/**
 * Traverses up the DOM to locate Instagram's post container element.
 * Only matches legitimate photo post links (a[href*="/p/"]) or photo post articles.
 *
 * @param {HTMLElement} element
 * @returns {HTMLElement|null}
 */
export function findClosestPost(element) {
  if (!element) return null;
  if (element.closest('a[href*="/reel"]')) return null;

  return (
    element.closest('a[href*="/p/"]') ||
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

/**
 * Finds the media wrapper element that directly bounds the post image/carousel,
 * ensuring UI elements (like hover buttons) are attached INSIDE the image container
 * rather than at the top of the post article where the header/three-dot menu resides.
 *
 * @param {HTMLElement} element
 * @returns {HTMLElement}
 */
export function findPostMediaContainer(element) {
  if (!element) return document.body;

  // If inside a post link (profile grid or feed permalink tile), that link bounds the media
  const postLink = element.closest('a[href*="/p/"]');
  if (postLink) return postLink;

  // If inside an article (feed post): locate the direct child of <article> that contains the media
  const article = element.closest('article');
  if (article) {
    let curr = element;
    while (curr && curr.parentElement && curr.parentElement !== article && curr.parentElement !== document.body) {
      curr = curr.parentElement;
    }
    if (curr && curr.parentElement === article) {
      return curr;
    }
  }

  // Fallback to parent element
  return element.parentElement || element;
}

/**
 * Finds Instagram's native carousel "Next" button in the post container.
 *
 * @param {HTMLElement} postContainer
 * @returns {HTMLElement|null}
 */
export function findNativeCarouselNextButton(postContainer) {
  if (!postContainer) return null;

  // 1. Check for standard accessible aria-labels
  const labelMatches = postContainer.querySelectorAll(
    'button[aria-label*="Next" i], button[aria-label*="next" i], ' +
    'button[aria-label*="Suivant" i], button[aria-label*="Weiter" i], ' +
    'button[aria-label*="Siguiente" i], button[aria-label*="Avanti" i], ' +
    'button[aria-label*="Próximo" i], ' +
    'div[role="button"][aria-label*="Next" i]'
  );
  if (labelMatches.length > 0) {
    return labelMatches[labelMatches.length - 1];
  }

  // 2. Check for button in media area containing chevron SVG
  const buttons = Array.from(postContainer.querySelectorAll('button, div[role="button"]'));
  for (const btn of buttons) {
    if (btn.closest('header, section, form')) continue;

    const svg = btn.querySelector('svg');
    if (!svg) continue;

    const svgLabel = (svg.getAttribute('aria-label') || '').toLowerCase();
    if (svgLabel.includes('next') || svgLabel.includes('chevron')) {
      return btn;
    }

    const polyline = svg.querySelector('polyline');
    if (polyline) {
      const rect = btn.getBoundingClientRect();
      const postRect = postContainer.getBoundingClientRect();
      if (rect.left > postRect.left + postRect.width * 0.5) {
        return btn;
      }
    }
  }

  return null;
}

/**
 * Finds Instagram's native carousel "Previous" button in the post container.
 *
 * @param {HTMLElement} postContainer
 * @returns {HTMLElement|null}
 */
export function findNativeCarouselPrevButton(postContainer) {
  if (!postContainer) return null;

  const labelMatches = postContainer.querySelectorAll(
    'button[aria-label*="Previous" i], button[aria-label*="prev" i], ' +
    'button[aria-label*="Précédent" i], button[aria-label*="Zurück" i], ' +
    'button[aria-label*="Anterior" i], button[aria-label*="Precedente" i], ' +
    'div[role="button"][aria-label*="Previous" i]'
  );
  if (labelMatches.length > 0) {
    return labelMatches[0];
  }

  const buttons = Array.from(postContainer.querySelectorAll('button, div[role="button"]'));
  for (const btn of buttons) {
    if (btn.closest('header, section, form')) continue;

    const svg = btn.querySelector('svg');
    if (!svg) continue;

    const svgLabel = (svg.getAttribute('aria-label') || '').toLowerCase();
    if (svgLabel.includes('prev') || svgLabel.includes('back')) {
      return btn;
    }

    const polyline = svg.querySelector('polyline');
    if (polyline) {
      const rect = btn.getBoundingClientRect();
      const postRect = postContainer.getBoundingClientRect();
      if (rect.left < postRect.left + postRect.width * 0.5) {
        return btn;
      }
    }
  }

  return null;
}

/**
 * Checks whether a post container is a carousel post.
 *
 * @param {HTMLElement} postContainer
 * @returns {boolean}
 */
export function isCarouselPost(postContainer) {
  if (!postContainer) return false;

  // 1. Multiple legitimate post images already in DOM
  const imgs = findPostImages(postContainer);
  if (imgs.length > 1) return true;

  // 2. Native Next or Previous button exists
  if (findNativeCarouselNextButton(postContainer) || findNativeCarouselPrevButton(postContainer)) {
    return true;
  }

  // 3. Carousel icon in tile
  if (postContainer.querySelector('svg[aria-label*="Carousel" i], svg[aria-label*="carousel" i]')) {
    return true;
  }

  // 4. Counter text matching e.g. "1/5" or "1 of 5"
  const text = postContainer.innerText || postContainer.textContent || '';
  if (/\b\d+\s*[/of]\s*\d+\b/i.test(text.slice(0, 300))) {
    return true;
  }

  return false;
}

/**
 * Returns estimated or exact total slide count for a post container.
 *
 * @param {HTMLElement} postContainer
 * @returns {number}
 */
export function getEstimatedSlideCount(postContainer) {
  if (!postContainer) return 1;

  // 1. Check for text counter like "1/5" -> 5
  const text = postContainer.innerText || postContainer.textContent || '';
  const match = text.slice(0, 300).match(/\b\d+\s*[/of]\s*(\d+)\b/i);
  if (match) {
    const total = parseInt(match[1], 10);
    if (total >= 2 && total <= 20) return total;
  }

  // 2. Check for pagination dot elements in media container
  const allDivs = Array.from(postContainer.querySelectorAll('div'));
  for (const div of allDivs) {
    const children = Array.from(div.children);
    if (children.length >= 2 && children.length <= 15) {
      const firstChild = children[0];
      const style = window.getComputedStyle(firstChild);
      const w = parseFloat(style.width);
      const h = parseFloat(style.height);
      if (w > 0 && w <= 16 && h > 0 && h <= 16) {
        return children.length;
      }
    }
  }

  const imgs = findPostImages(postContainer);
  return Math.max(1, imgs.length);
}
