/**
 * hover-button.js
 * Injects sleek, disappearing glassmorphism HD buttons over Instagram image posts.
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
    this.attachedContainers = new WeakSet();
  }

  /**
   * Attaches a hover trigger to an image or its parent container.
   *
   * @param {HTMLImageElement} imgElement
   * @param {HTMLElement} container
   */
  attach(imgElement, container) {
    if (!container || this.attachedContainers.has(container)) return;
    this.attachedContainers.add(container);

    // Ensure container has positioning context
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.position === 'static') {
      container.style.position = 'relative';
    }

    // Build hover button container
    const btnContainer = createElement('div', {
      className: 'immerse-hover-btn-container'
    });

    const btn = createElement('button', {
      className: 'immerse-hover-btn',
      attributes: {
        type: 'button',
        title: 'Open in High-Resolution Fullscreen (Immerse)',
        'aria-label': 'Open in High-Resolution Fullscreen'
      },
      innerHTML: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>HD</span>
      `
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.onTrigger(imgElement, container);
    });

    btnContainer.appendChild(btn);

    // Hover fade-in / fade-out listeners
    let hideTimer = null;
    container.addEventListener('mouseenter', () => {
      if (hideTimer) clearTimeout(hideTimer);
      const settings = this.getSettings ? this.getSettings() : { enabled: true };
      if (settings.enabled !== false) {
        btn.classList.add('immerse-visible');
      }
    });

    container.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(() => {
        btn.classList.remove('immerse-visible');
      }, 150);
    });

    // Optional direct image click trigger if enabled in settings
    imgElement.addEventListener('click', (e) => {
      const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: 'both' };
      if (!settings.enabled) return;

      if (settings.triggerMode === 'image-click' || settings.triggerMode === 'both') {
        // Prevent opening Instagram's native modal only when user explicitly intended to expand
        e.preventDefault();
        e.stopPropagation();
        this.onTrigger(imgElement, container);
      }
    }, true);

    container.appendChild(btnContainer);
  }
}
