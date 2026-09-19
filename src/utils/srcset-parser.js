/**
 * srcset-parser.js
 * Robust parser for srcset attributes and Instagram high-resolution image candidates.
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

  // Regex to match: [URL] followed by optional [whitespace + descriptor (e.g. 1080w, 2x)]
  // Matches candidates separated by comma where comma is followed by whitespace and next url
  const candidateRegex = /(?:^|,)\s*([^\s]+)\s*(?:([0-9.]+)w|([0-9.]+)x)?/g;
  const candidates = [];
  let match;

  while ((match = candidateRegex.exec(trimmed)) !== null) {
    const rawUrl = match[1];
    if (!rawUrl) continue;

    const widthDesc = match[2] ? parseFloat(match[2]) : 0;
    const densityDesc = match[3] ? parseFloat(match[3]) : 0;

    // Estimate width if density descriptor is used (assuming baseline 1080px or 640px)
    let effectiveWidth = widthDesc;
    if (!effectiveWidth && densityDesc) {
      effectiveWidth = Math.round(densityDesc * 640);
    }

    // Try extracting dimension from URL if no descriptor is provided
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
 * e.g., /s1080x1080/, /s750x750/, /p1080x1080/, /1080w/
 *
 * @param {string} url
 * @returns {number}
 */
export function extractWidthFromUrl(url) {
  if (!url || typeof url !== 'string') return 0;

  // Patterns like s1080x1080, p750x750, 1080x1350, c0.0.1440.1440, /1080w/
  const match = url.match(/[sp]?(\d{3,4})x(\d{3,4})/i)
    || url.match(/c\d+\.\d+\.(\d{3,4})\.(\d{3,4})/i)
    || url.match(/[_\-/](\d{3,4})w/i);

  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

/**
 * Resolves the highest resolution image URL from an HTMLImageElement or raw attributes.
 *
 * @param {HTMLImageElement|{srcset?: string, src?: string, currentSrc?: string}} imgElement
 * @returns {string} The highest resolution image URL.
 */
export function getHighestResolutionUrl(imgElement) {
  if (!imgElement) return '';

  const srcset = (typeof imgElement.getAttribute === 'function'
    ? imgElement.getAttribute('srcset')
    : imgElement.srcset) || '';

  const candidates = parseSrcset(srcset);

  if (candidates.length > 0 && candidates[0].url) {
    return candidates[0].url;
  }

  // Fallback to currentSrc or src
  const fallbackUrl = (imgElement.currentSrc || imgElement.src || '');
  return fallbackUrl;
}
