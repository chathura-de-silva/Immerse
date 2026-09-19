/**
 * hover-button.js
 * Injects modern transparent frosted glass HD buttons exclusively over Instagram post tiles
 * and activates whenever the cursor hovers ANYWHERE on the image tile in the grid or feed.
 */

import { createElement, isLegitimatePostImage } from '../utils/dom-helpers.js';

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
   * whenever the user hovers anywhere within a legitimate post grid tile or feed card.
   */
  _initDelegatedHover() {
    let hideTimer = null;

    document.addEventListener('pointerover', (e) => {
      const settings = this.getSettings ? this.getSettings() : { enabled: true };
      if (!settings.enabled) return;

      const target = e.target;
      if (!target) return;

      // Strictly match photo post grid links or post articles (never reels, hovercards, avatars, or dialogs)
      const tile = target.closest('a[href*="/p/"]') ||
                   target.closest('article');

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
                   target.closest('article');

      if (tile && this.tileToButtonMap.has(tile)) {
        const related = e.relatedTarget;
        if (!related || !tile.contains(related)) {
          const btn = this.tileToButtonMap.get(tile);
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => {
            btn.classList.remove('immerse-visible');
            if (this.activeButton === btn) this.activeButton = null;
          }, 100);
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
    if (!imgElement || !isLegitimatePostImage(imgElement)) return;

    // Resolve the outermost interactive tile (must be a photo post link or article)
    const tile = imgElement.closest('a[href*="/p/"]') ||
                 imgElement.closest('article') ||
                 container;

    if (!tile || this.tileToButtonMap.has(tile)) return;
    if (tile.matches('a[href*="/reel"]') || tile.querySelector('a[href*="/reel"]')) return;

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
        title: 'View in Fullscreen Ultra-HD (Immerse)',
        'aria-label': 'View in Fullscreen Ultra-HD'
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
