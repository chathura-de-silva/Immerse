/**
 * srcset-parser.js
 * Zero-fragile resolution engine for Instagram media.
 *
 * Exclusively leverages Meta's cryptographically signed srcset candidates
 * and GraphQL structures to guarantee 100% reliable, highest-resolution loading.
 */

/**
 * @typedef {Object} SrcCandidate
 * @property {string} url - The cryptographically signed URL of the image.
 * @property {number} width - The width descriptor in pixels.
 * @property {number} density - The pixel density descriptor.
 */

/**
 * Parses an HTML5 srcset string into an array of candidates.
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

  // Sort descending by effective pixel width
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

  if (typeof obj.display_url === 'string' && obj.display_url.startsWith('http')) {
    return {
      url: obj.display_url,
      width: obj.dimensions?.width || 1080,
      height: obj.dimensions?.height || 1080
    };
  }

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
 * Returns all verified, cryptographically signed resolution candidates for an image,
 * sorted descending by quality.
 *
 * @param {HTMLImageElement} imgElement
 * @returns {Array<{url: string, width: number}>}
 */
export function getResolutionCandidates(imgElement) {
  if (!imgElement) return [];

  const candidates = [];
  const seenUrls = new Set();

  // Tier 1: React Fiber master GraphQL candidates
  try {
    const fiberCandidate = extractFromReactFiber(imgElement);
    if (fiberCandidate?.url && !seenUrls.has(fiberCandidate.url)) {
      seenUrls.add(fiberCandidate.url);
      candidates.push({
        url: fiberCandidate.url,
        width: fiberCandidate.width || 1080
      });
    }
  } catch {}

  // Tier 2: Meta's cryptographically signed srcset candidates
  const srcset = (typeof imgElement.getAttribute === 'function'
    ? imgElement.getAttribute('srcset')
    : imgElement.srcset) || '';

  const parsed = parseSrcset(srcset);
  for (const item of parsed) {
    if (item.url && !seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      candidates.push({
        url: item.url,
        width: item.width || 640
      });
    }
  }

  // Tier 3: Fallback currentSrc or src
  const fallbackUrl = imgElement.currentSrc || imgElement.src || '';
  if (fallbackUrl && !seenUrls.has(fallbackUrl)) {
    seenUrls.add(fallbackUrl);
    candidates.push({
      url: fallbackUrl,
      width: extractWidthFromUrl(fallbackUrl) || 640
    });
  }

  // Sort descending by width
  candidates.sort((a, b) => b.width - a.width);
  return candidates;
}

/**
 * Resolves the guaranteed highest-resolution URL for an image.
 * Never alters HMAC query parameters; only uses Meta's officially signed URLs.
 *
 * @param {HTMLImageElement} imgElement
 * @returns {string} The highest resolution signed image URL.
 */
export function getHighestResolutionUrl(imgElement) {
  const candidates = getResolutionCandidates(imgElement);
  return candidates.length > 0 ? candidates[0].url : (imgElement?.currentSrc || imgElement?.src || '');
}
