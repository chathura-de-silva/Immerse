/**
 * hover-button.js
 * Injects sleek, disappearing liquid-glass HD buttons over Instagram image posts
 * and activates whenever the mouse hovers anywhere on the tile.
 */

import { createElement } from '../utils/dom-helpers.js';

export class HoverButtonManager {
  /**
   * @param {Object} options
   * @param {(targetImg: HTMLImageElement, container: HTMLElement) => void} options.onTrigger
   * @param {() => Object} options.getSettings
   */
  constructor({ onTrigger, getSettings }) {
    this.onTrigger = onTrigger;
    this.getSettings = getSettings;
    this.attachedTiles = new WeakSet();
  }

  /**
   * Attaches a hover trigger to an image or its parent tile in the grid or feed.
   *
   * @param {HTMLImageElement} imgElement
   * @param {HTMLElement} container
   */
  attach(imgElement, container) {
    if (!imgElement) return;

    // Resolve the outermost interactive tile (e.g. grid <a> link or article)
    const tile = imgElement.closest('a[href^="/p/"]') ||
                 imgElement.closest('a[href^="/reel/"]') ||
                 imgElement.closest('div._aabd') ||
                 imgElement.closest('article') ||
                 container ||
                 imgElement.parentElement;

    if (!tile || this.attachedTiles.has(tile)) return;
    this.attachedTiles.add(tile);

    // Ensure tile has relative positioning context for placement
    const tileStyle = window.getComputedStyle(tile);
    if (tileStyle.position === 'static') {
      tile.style.position = 'relative';
    }

    // Build liquid-glass button container
    const btnContainer = createElement('div', {
      className: 'immerse-hover-btn-container'
    });

    const btn = createElement('button', {
      className: 'immerse-hover-btn',
      attributes: {
        type: 'button',
        title: 'View in Ultra-HD Fullscreen (Immerse)',
        'aria-label': 'View in Ultra-HD Fullscreen'
      },
      innerHTML: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>HD</span>
      `
    });

    // Trigger action on button click
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.onTrigger(imgElement, tile);
    });

    btnContainer.appendChild(btn);

    // Tile-wide hover detection: triggers anywhere on the tile
    let hideTimer = null;
    const showBtn = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      const settings = this.getSettings ? this.getSettings() : { enabled: true };
      if (settings.enabled !== false) {
        btn.classList.add('immerse-visible');
      }
    };

    const hideBtn = () => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        btn.classList.remove('immerse-visible');
      }, 120);
    };

    tile.addEventListener('mouseenter', showBtn, { passive: true });
    tile.addEventListener('mousemove', showBtn, { passive: true });
    tile.addEventListener('mouseleave', hideBtn, { passive: true });

    // Optional direct image / tile click trigger if enabled in settings
    imgElement.addEventListener('click', (e) => {
      const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: 'both' };
      if (!settings.enabled) return;

      if (settings.triggerMode === 'image-click' || settings.triggerMode === 'both') {
        e.preventDefault();
        e.stopPropagation();
        this.onTrigger(imgElement, tile);
      }
    }, true);

    tile.appendChild(btnContainer);
  }
}
