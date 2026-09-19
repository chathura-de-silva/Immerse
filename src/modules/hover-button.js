/**
 * hover-button.js
 * Injects modern transparent frosted glass HD buttons exclusively over Instagram post tiles
 * and activates whenever the cursor hovers ANYWHERE on the image tile in the grid or feed.
 */

import { createElement, isLegitimatePostImage, findPostMediaContainer, isLegitimatePhotoPost } from '../utils/dom-helpers.js';

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
      const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: 'both' };
      if (!settings.enabled || settings.triggerMode === 'image-click') return;

      const target = e.target;
      if (!target) return;

      // Strictly match photo post grid links or post articles (never reels, hovercards, avatars, or dialogs)
      const tile = target.closest('a[href*="/p/"]') ||
                   target.closest('article');

      if (tile && !isLegitimatePhotoPost(tile)) return;

      // In feed posts: only activate when cursor is hovering within the photo/media area,
      // strictly ignoring post header (avatar/author/3-dot menu), comments, and action buttons
      if (tile && tile.tagName === 'ARTICLE') {
        const inHeaderOrMenu = target.closest('header, section, form, [role="menu"], [role="button"]');
        if (inHeaderOrMenu && !target.closest('.immerse-hover-btn-container')) {
          if (this.activeButton) {
            this.activeButton.classList.remove('immerse-visible');
            this.activeButton = null;
          }
          return;
        }
      }

      let btn = tile ? this.tileToButtonMap.get(tile) : null;
      if (!btn && target) {
        const media = findPostMediaContainer(target);
        if (media) btn = this.tileToButtonMap.get(media);
      }

      if (btn) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }

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
        const isStillInTile = related && tile.contains(related);
        const enteredHeaderInArticle = isStillInTile && tile.tagName === 'ARTICLE' && related.closest && related.closest('header, section, form, [role="menu"]');

        if (!isStillInTile || enteredHeaderInArticle) {
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

    if (!tile || !isLegitimatePhotoPost(tile) || this.tileToButtonMap.has(tile)) return;

    // Position specifically inside the media/photo container, NOT over the article header/3-dot menu
    const mediaContainer = findPostMediaContainer(imgElement);

    // Ensure media container has relative positioning context for placement
    const mediaStyle = window.getComputedStyle(mediaContainer);
    if (mediaStyle.position === 'static') {
      mediaContainer.style.position = 'relative';
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
      const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: 'both' };
      if (!settings.enabled || settings.triggerMode === 'image-click') return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.onTrigger(imgElement, tile);
    });

    btnContainer.appendChild(btn);
    this.tileToButtonMap.set(tile, btn);
    if (mediaContainer !== tile) {
      this.tileToButtonMap.set(mediaContainer, btn);
    }

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

    mediaContainer.appendChild(btnContainer);
  }

  /**
   * Hides all active hover buttons immediately.
   */
  hideAll() {
    if (this.activeButton) {
      this.activeButton.classList.remove('immerse-visible');
      this.activeButton = null;
    }
  }
}
