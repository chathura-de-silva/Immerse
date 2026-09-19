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
 * Strict validator that checks if a post container is a legitimate photo or carousel post,
 * explicitly rejecting Instagram Reels, video posts, and Sponsored ads.
 *
 * @param {HTMLElement} container
 * @returns {boolean}
 */
export function isLegitimatePhotoPost(container) {
  if (!container) return false;

  // 1. Explicitly reject reels or video links/paths
  if (container.matches && (container.matches('a[href*="/reel"], a[href*="/reels"], a[href*="/tv/"]') || container.querySelector('a[href*="/reel"], a[href*="/reels"], a[href*="/tv/"]'))) {
    return false;
  }

  // 2. Reject videos: if post contains a <video> element or video controls
  if (container.querySelector && container.querySelector('video')) {
    return false;
  }
  if (container.querySelector && container.querySelector(
    'video, [aria-label*="Audio" i], [aria-label*="mute" i], [aria-label*="unmute" i], [aria-label*="sound" i], [aria-label*="volume" i], [aria-label*="Play" i], [aria-label*="Pause" i], [aria-label*="Reel" i], [aria-label*="Clip" i], [aria-label*="Video" i]'
  )) {
    return false;
  }

  // 3. Reject Sponsored Ads:
  // Outgoing ad tracking link or ad settings
  if (container.querySelector && container.querySelector('a[href*="l.instagram.com"], a[href*="/ads/"], a[href*="about/ads"]')) {
    return false;
  }

  // Sponsored aria-label indicators
  if (container.querySelector && container.querySelector('[aria-label*="Sponsored" i], [aria-label*="Paid partnership" i]')) {
    return false;
  }

  // Header or top text of post containing "Sponsored" or "Paid partnership"
  const header = container.querySelector ? container.querySelector('header') : null;
  const headerText = (header ? header.innerText || header.textContent : '') || '';
  if (/\b(Sponsored|Paid partnership)\b/i.test(headerText)) {
    return false;
  }

  const topText = (container.innerText || container.textContent || '').slice(0, 800);
  if (/\b(Sponsored|Paid partnership)\b/i.test(topText)) {
    return false;
  }

  // Check for ad call-to-action buttons
  const adCtaRegex = /\b(Learn More|Shop Now|Install Now|Sign Up|Book Now|Apply Now|Get Offer|Order Now|Contact Us|Watch More|Subscribe|Send Message|Download|Listen Now|Play Game|Use App|Get Quote|Get Showtimes|Check Availability|Claim Offer|Open link)\b/i;
  const buttons = container.querySelectorAll ? container.querySelectorAll('button, div[role="button"], a') : [];
  for (const b of buttons) {
    const bText = b.innerText || b.textContent || '';
    if (adCtaRegex.test(bText)) {
      return false;
    }
  }

  return true;
}

/**
 * Strict validator that checks if an image is a genuine post/grid photo,
 * explicitly rejecting profile avatars, hovercard popups, story rings, icons, reels, and ads.
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

  // 2. Reject avatars, story bubbles, profile pictures, and video poster frames
  const alt = (img.alt || '').toLowerCase();
  if (alt.includes('profile picture') || alt.includes('avatar') || alt.includes('story')) {
    return false;
  }
  if (/\b(video|reel|clip)\b/i.test(alt)) {
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
  if (img.closest('a[href*="/reel"], a[href*="/reels"], a[href*="/tv/"]')) {
    return false;
  }

  // 6. Must reside within a legitimate photo post link or article (never a video post or sponsored ad)
  const postLink = img.closest('a[href*="/p/"], article');
  if (!postLink || !isLegitimatePhotoPost(postLink)) {
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

  const post = (
    element.closest('a[href*="/p/"]') ||
    element.closest('article') ||
    element.closest('div[role="dialog"] a[href*="/p/"]')
  );

  if (!post || !isLegitimatePhotoPost(post)) return null;
  return post;
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
  if (!element) return (typeof document !== 'undefined' ? document.body : null);

  // If inside an article (feed post): strictly resolve the media/image container INSIDE the article,
  // NEVER an outer container that encompasses the post header or the three-dot menu.
  const article = element.closest ? element.closest('article') : null;
  if (article) {
    let curr = element;
    let mediaBox = element.parentElement || element;

    while (curr && curr.parentElement && curr.parentElement !== article && curr.parentElement !== (typeof document !== 'undefined' ? document.body : null)) {
      const parent = curr.parentElement;
      const hasHeaderOrMenu = parent.querySelector ? parent.querySelector(
        'header, svg[aria-label*="More" i], button[aria-label*="More" i], [aria-label*="Options" i]'
      ) : null;
      const hasActions = parent.querySelector ? parent.querySelector(
        'section, svg[aria-label*="Like" i], svg[aria-label*="Comment" i], svg[aria-label*="Share" i]'
      ) : null;
      if (hasHeaderOrMenu || hasActions) {
        break;
      }
      mediaBox = parent;
      curr = parent;
    }
    return mediaBox;
  }

  // If inside a post link (profile grid or permalink tile without header)
  const postLink = element.closest ? element.closest('a[href*="/p/"]') : null;
  if (postLink && (!postLink.querySelector || !postLink.querySelector('header, svg[aria-label*="More" i]'))) {
    return postLink;
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
 * Checks whether an element belongs to Instagram's feed view (inside an <article> or on feed URL).
 * Profile grid views, explore grids, etc. return false.
 *
 * @param {HTMLElement} [element]
 * @returns {boolean}
 */
export function isFeedContext(element) {
  if (typeof window === 'undefined') {
    // In headless test environments: check if element is explicitly a non-feed profile tile
    if (element && element.matches && element.matches('a[href*="/p/"]') && element.tagName !== 'ARTICLE' && !element.closest?.('article')) {
      return false;
    }
    return true;
  }

  if (window.location && (window.location.pathname === '/' || window.location.pathname.startsWith('/feed'))) {
    return true;
  }

  if (element) {
    return element.tagName === 'ARTICLE' || (element.closest && !!element.closest('article'));
  }

  return false;
}

/**
 * Checks whether a post container is a carousel post.
 *
 * @param {HTMLElement} postContainer
 * @returns {boolean}
 */
export function isCarouselPost(postContainer) {
  if (!postContainer) return false;

  // Carousels are strictly handled in feed view; profile grid posts are viewed as individual photos
  if (!isFeedContext(postContainer)) return false;

  // 1. Multiple legitimate post images already in DOM
  const imgs = findPostImages(postContainer);
  if (imgs.length > 1) return true;

  // 2. Native Next or Previous button exists
  if (findNativeCarouselNextButton(postContainer) || findNativeCarouselPrevButton(postContainer)) {
    return true;
  }

  // 3. Counter text matching e.g. "1/5" or "1 of 5"
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

  if (!isFeedContext(postContainer)) return 1;

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
      const style = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(firstChild) : null;
      if (style) {
        const w = parseFloat(style.width);
        const h = parseFloat(style.height);
        if (w > 0 && w <= 16 && h > 0 && h <= 16) {
          return children.length;
        }
      }
    }
  }

  const imgs = findPostImages(postContainer);
  return Math.max(1, imgs.length);
}
