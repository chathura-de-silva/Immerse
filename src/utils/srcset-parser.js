/**
 * srcset-parser.js
 * Multi-tier engine to resolve the absolute highest resolution image from Instagram.
 *
 * Tier 1: React Fiber & Props inspection (GraphQL master candidates: image_versions2, display_resources)
 * Tier 2: Complete srcset candidate parsing (max width/density)
 * Tier 3: CDN URL parameter upgrading (upgrades s640x640/s750x750 to s1080x1080/p1080x1080)
 */

/**
 * @typedef {Object} SrcCandidate
 * @property {string} url - The URL of the image candidate.
 * @property {number} width - The width descriptor in pixels (or estimated width).
 * @property {number} density - The pixel density descriptor (e.g., 1x, 2x) if provided.
 */

/**
 * Parses a srcset string into an array of candidates.
 * Robust against URLs containing commas in query strings.
 *
 * @param {string} srcset - The srcset attribute value.
 * @returns {SrcCandidate[]} Sorted array of candidates (highest resolution first).
 */
export function parseSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') {
    return [];
  }

  const trimmed = srcset.trim();
  if (!trimmed) {
    return [];
  }

  const candidateRegex = /(?:^|,)\s*([^\s]+)\s*(?:([0-9.]+)w|([0-9.]+)x)?/g;
  const candidates = [];
  let match;

  while ((match = candidateRegex.exec(trimmed)) !== null) {
    const rawUrl = match[1];
    if (!rawUrl) continue;

    const widthDesc = match[2] ? parseFloat(match[2]) : 0;
    const densityDesc = match[3] ? parseFloat(match[3]) : 0;

    let effectiveWidth = widthDesc;
    if (!effectiveWidth && densityDesc) {
      effectiveWidth = Math.round(densityDesc * 640);
    }

    if (!effectiveWidth) {
      effectiveWidth = extractWidthFromUrl(rawUrl);
    }

    candidates.push({
      url: rawUrl,
      width: effectiveWidth,
      density: densityDesc || 1
    });
  }

  // Sort descending by effective width
  candidates.sort((a, b) => b.width - a.width);

  return candidates;
}

/**
 * Extracts width hints from Instagram CDN URLs when available
 * e.g., /s1080x1080/, /s750x750/, /1080x1350/, /c0.0.1440.1440/, /1080w/
 *
 * @param {string} url
 * @returns {number}
 */
export function extractWidthFromUrl(url) {
  if (!url || typeof url !== 'string') return 0;

  const match = url.match(/[sp]?(\d{3,4})x(\d{3,4})/i)
    || url.match(/c\d+\.\d+\.(\d{3,4})\.(\d{3,4})/i)
    || url.match(/[_\-/](\d{3,4})w/i);

  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Upgrades lower-resolution Instagram CDN URL dimension parameters to 1080px.
 * e.g., s640x640 -> s1080x1080, p750x750 -> p1080x1080
 *
 * @param {string} url
 * @returns {string} Upgraded URL
 */
export function upgradeCdnUrl(url) {
  if (!url || typeof url !== 'string') return url;

  // Replace common sub-1080 downsampling dimensions with 1080
  return url.replace(/([sp])(150|240|320|480|640|750)x\2/g, '$11080x1080');
}

/**
 * Inspects React internals (Fiber and Props) on an element or its ancestors
 * to extract master resolution media candidates (e.g., image_versions2, display_resources).
 *
 * @param {HTMLElement} element
 * @returns {{url: string, width: number, height: number}|null}
 */
export function extractFromReactFiber(element) {
  if (!element || typeof element !== 'object') return null;

  let curr = element;
  for (let depth = 0; depth < 5 && curr; depth++) {
    // 1. Inspect React Props
    const propsKey = Object.keys(curr).find(k => k.startsWith('__reactProps$'));
    if (propsKey && curr[propsKey]) {
      const match = searchMediaProps(curr[propsKey], 0);
      if (match) return match;
    }

    // 2. Inspect React Fiber
    const fiberKey = Object.keys(curr).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (fiberKey && curr[fiberKey]) {
      let fiber = curr[fiberKey];
      for (let fDepth = 0; fDepth < 8 && fiber; fDepth++) {
        const match = searchMediaProps(fiber.memoizedProps, 0) || searchMediaProps(fiber.pendingProps, 0);
        if (match) return match;
        fiber = fiber.return;
      }
    }

    curr = curr.parentElement;
  }

  return null;
}

/**
 * Helper to recursively search an object for Instagram GraphQL/media structures.
 */
function searchMediaProps(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;

  // Pattern A: image_versions2 (contains raw master candidates, often up to 1440px)
  if (obj.image_versions2?.candidates && Array.isArray(obj.image_versions2.candidates)) {
    const sorted = [...obj.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
    if (sorted[0]?.url) {
      return {
        url: sorted[0].url,
        width: sorted[0].width || 1080,
        height: sorted[0].height || 1080
      };
    }
  }

  // Pattern B: display_resources
  if (obj.display_resources && Array.isArray(obj.display_resources)) {
    const sorted = [...obj.display_resources].sort((a, b) => (b.config_width || 0) - (a.config_width || 0));
    if (sorted[0]?.src) {
      return {
        url: sorted[0].src,
        width: sorted[0].config_width || 1080,
        height: sorted[0].config_height || 1080
      };
    }
  }

  // Pattern C: display_url
  if (typeof obj.display_url === 'string' && obj.display_url.startsWith('http')) {
    return {
      url: obj.display_url,
      width: obj.dimensions?.width || 1080,
      height: obj.dimensions?.height || 1080
    };
  }

  // Recursively inspect key properties (post, media, item, carousel_media)
  const interestingKeys = ['post', 'media', 'item', 'carousel_media', 'node'];
  for (const key of interestingKeys) {
    if (obj[key]) {
      const match = searchMediaProps(obj[key], depth + 1);
      if (match) return match;
    }
  }

  return null;
}

/**
 * Resolves the absolute highest resolution image URL from an HTMLImageElement or raw attributes.
 * Combines React fiber inspection, srcset maximization, and CDN upgrading.
 *
 * @param {HTMLImageElement|{srcset?: string, src?: string, currentSrc?: string}} imgElement
 * @returns {string} The highest resolution image URL.
 */
export function getHighestResolutionUrl(imgElement) {
  if (!imgElement) return '';

  // Tier 1: Try React Fiber GraphQL media candidate
  try {
    const fiberCandidate = extractFromReactFiber(imgElement);
    if (fiberCandidate?.url) {
      return fiberCandidate.url;
    }
  } catch {
    // Graceful fallback to srcset
  }

  // Tier 2: Inspect srcset
  const srcset = (typeof imgElement.getAttribute === 'function'
    ? imgElement.getAttribute('srcset')
    : imgElement.srcset) || '';

  const candidates = parseSrcset(srcset);

  if (candidates.length > 0 && candidates[0].url) {
    // If the top candidate is already >= 1080w, return it directly
    if (candidates[0].width >= 1080) {
      return candidates[0].url;
    }
    // If smaller than 1080, attempt CDN dimension upgrade
    return upgradeCdnUrl(candidates[0].url);
  }

  // Tier 3: Fallback to currentSrc or src + CDN upgrade
  const fallbackUrl = (imgElement.currentSrc || imgElement.src || '');
  return upgradeCdnUrl(fallbackUrl);
}
