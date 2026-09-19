/**
 * hover-button.js
 * Injects modern transparent frosted glass HD buttons over Instagram image posts
 * and activates whenever the cursor hovers ANYWHERE on the image tile in the grid or feed.
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
    this.tileToButtonMap = new Map();
    this.activeButton = null;

    this._initDelegatedHover();
  }

  /**
   * Centralized delegated hover detection ensuring the button appears
   * whenever the user hovers ANYWHERE within the image tile (grid item or feed card).
   */
  _initDelegatedHover() {
    let hideTimer = null;

    document.addEventListener('pointerover', (e) => {
      const settings = this.getSettings ? this.getSettings() : { enabled: true };
      if (!settings.enabled) return;

      const target = e.target;
      if (!target) return;

      // Find if cursor is anywhere inside an Instagram post tile
      const tile = target.closest('a[href*="/p/"]') ||
                   target.closest('a[href*="/reel/"]') ||
                   target.closest('article') ||
                   target.closest('div[role="dialog"]');

      if (tile && this.tileToButtonMap.has(tile)) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }

        const btn = this.tileToButtonMap.get(tile);
        if (this.activeButton && this.activeButton !== btn) {
          this.activeButton.classList.remove('immerse-visible');
        }
        this.activeButton = btn;
        btn.classList.add('immerse-visible');
      }
    }, { passive: true });

    document.addEventListener('pointerout', (e) => {
      const target = e.target;
      if (!target) return;

      const tile = target.closest('a[href*="/p/"]') ||
                   target.closest('a[href*="/reel/"]') ||
                   target.closest('article');

      if (tile && this.tileToButtonMap.has(tile)) {
        const related = e.relatedTarget;
        if (!related || !tile.contains(related)) {
          const btn = this.tileToButtonMap.get(tile);
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            btn.classList.remove('immerse-visible');
            if (this.activeButton === btn) this.activeButton = null;
          }, 120);
        }
      }
    }, { passive: true });
  }

  /**
   * Attaches the hover trigger to a media tile.
   *
   * @param {HTMLImageElement} imgElement
   * @param {HTMLElement} container
   */
  attach(imgElement, container) {
    if (!imgElement) return;

    // Resolve the outermost interactive tile
    const tile = imgElement.closest('a[href*="/p/"]') ||
                 imgElement.closest('a[href*="/reel/"]') ||
                 imgElement.closest('article') ||
                 container ||
                 imgElement.parentElement;

    if (!tile || this.tileToButtonMap.has(tile)) return;

    // Ensure tile has relative positioning context for placement
    const tileStyle = window.getComputedStyle(tile);
    if (tileStyle.position === 'static') {
      tile.style.position = 'relative';
    }

    // Build modern frosted glass button container
    const btnContainer = createElement('div', {
      className: 'immerse-hover-btn-container'
    });

    const btn = createElement('button', {
      className: 'immerse-hover-btn',
      attributes: {
        type: 'button',
        title: 'Open in Fullscreen Ultra-HD (Immerse)',
        'aria-label': 'Open in Fullscreen Ultra-HD'
      },
      innerHTML: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>HD</span>
      `
    });

    // Handle button activation
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.onTrigger(imgElement, tile);
    });

    btnContainer.appendChild(btn);
    this.tileToButtonMap.set(tile, btn);

    // Also support direct image click if preferred in settings
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
