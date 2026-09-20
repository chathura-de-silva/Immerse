/**
 * viewer-overlay.js
 * High-performance fullscreen lightbox overlay with clean separation between
 * grid post navigation (primary) and carousel slide navigation (secondary),
 * true infinite feed loading, and zero-fragile design.
 */

import {
  createElement,
  findPostImages,
  isCarouselPost,
  getEstimatedSlideCount,
  findNativeCarouselNextButton,
  findNativeCarouselPrevButton,
  isFeedContext
} from '../utils/dom-helpers.js';
import { getHighestResolutionUrl } from '../utils/srcset-parser.js';
import { ZoomPanController } from './viewer/zoom-pan.js';
import { EventsController } from './viewer/events.js';
import { NavigationController } from './viewer/navigation.js';
import { createOverlayDom } from './viewer/dom.js';

export class ViewerOverlay {
  constructor(options = {}) {
    this.options = options;
    this.onLoadMore = options.onLoadMore || null;
    this.onClose = options.onClose || null;
    this.isOpen = false;

    this.nav = new NavigationController(this);
    this.zoom = new ZoomPanController(this);
    this.events = new EventsController(this);

    this._badgeTextTimeout = null;
    this._counterTextTimeout = null;

    this.dom = null;
  }

  /**
   * Builds the DOM elements for the overlay with modern frosted glass styling.
   */
  _ensureDom() {
    if (this.dom) return;

    this.dom = createOverlayDom(this);
  }

  /**
   * Opens the lightbox overlay with the complete gallery of posts.
   *
   * @param {Array<Object>} posts Array of post objects
   * @param {number} [startPostIndex=0]
   * @param {number} [startSlideIndex=0]
   */
  open(posts, startPostIndex = 0, startSlideIndex = 0) {
    if (!posts || posts.length === 0) return;

    this._ensureDom();
    this.nav.posts = posts;
    this.nav.currentPostIndex = Math.max(0, Math.min(startPostIndex, posts.length - 1));
    this.nav.currentSlideIndex = startSlideIndex;

    // Reset image layers so opening starts fresh without transitioning from a prior session
    if (this.dom.img) {
      this.dom.img.src = '';
      this.dom.img.style.opacity = '0';
      this.dom.img.style.transform = 'translate3d(0, 0, 0)';
    }
    if (this.dom.imgPrev) {
      this.dom.imgPrev.src = '';
      this.dom.imgPrev.style.display = 'none';
      this.dom.imgPrev.style.opacity = '0';
    }

    if (!document.body.contains(this.dom.root)) {
      document.body.appendChild(this.dom.root);
    }

    requestAnimationFrame(() => {
      this.dom.root.classList.add('immerse-active');
      this.events.setup();
    });

    this.isOpen = true;

    this.nav.loadCurrent();
  }

  /**
   * Closes the lightbox overlay.
   */
  close() {
    if (!this.isOpen || !this.dom) return;

    this.dom.root.classList.remove('immerse-active');
    this.dom.root.classList.remove('immerse-controls-hidden');
    this.dom.root.classList.remove('immerse-cursor-hidden');
    this.events.cleanup();

    if (this.nav.spinnerTimeout) {
      clearTimeout(this.nav.spinnerTimeout);
      this.nav.spinnerTimeout = null;
    }

    if (this._badgeTextTimeout) {
      clearTimeout(this._badgeTextTimeout);
      this._badgeTextTimeout = null;
    }

    if (this._counterTextTimeout) {
      clearTimeout(this._counterTextTimeout);
      this._counterTextTimeout = null;
    }

    if (this.nav.waitingTimeout) {
      clearTimeout(this.nav.waitingTimeout);
      this.nav.waitingTimeout = null;
    }

    if (this.nav.navPollInterval) {
      clearInterval(this.nav.navPollInterval);
      this.nav.navPollInterval = null;
    }

    if (this.nav.loadMoreRetryInterval) {
      clearInterval(this.nav.loadMoreRetryInterval);
      this.nav.loadMoreRetryInterval = null;
    }

    this.nav.pendingNavigation = null;
    this.nav.activeLoadingImg = null;

    this.isOpen = false;
    this.nav.completeTransitionImmediately();
    this.zoom.resetTransform();

    if (this.dom?.img) {
      this.dom.img.src = '';
      this.dom.img.style.opacity = '0';
    }
    if (this.dom?.imgPrev) {
      this.dom.imgPrev.src = '';
      this.dom.imgPrev.style.display = 'none';
      this.dom.imgPrev.style.opacity = '0';
    }

    if (typeof this.onClose === 'function') {
      try {
        this.onClose();
      } catch (err) {
        console.warn('[Immerse] Error in onClose handler:', err);
      }
    }

    setTimeout(() => {
      if (!this.isOpen && this.dom?.root.parentElement) {
        this.dom.root.parentElement.removeChild(this.dom.root);
      }
    }, 250);
  }

  /**
   * Updates posts dynamically when Instagram loads more items in the background.
   *
   * @param {Array<Object>} newPosts
   */
  updatePosts(newPosts) {
    this.nav.updatePosts(newPosts);
  }


  /**
   * Updates overlay options dynamically when settings change.
   *
   * @param {Object} newSettings
   */
  updateSettings(newSettings = {}) {
    this.options = { ...this.options, ...newSettings };

    // Update resolution badge display dynamically
    if (this.dom?.badge) {
      const showBadge = !!this.options.showResolutionBadge;
      this.dom.badge.style.display = showBadge ? 'inline-flex' : 'none';
    }
  }

  /**
   * Smoothly updates resolution badge text with a liquid glide transition.
   *
   * @param {string} text
   */
  _updateBadgeText(text) {
    if (!this.dom?.badgeText) return;
    if (this.dom.badgeText.textContent === text) return;

    if (this._badgeTextTimeout) clearTimeout(this._badgeTextTimeout);

    this.dom.badgeText.classList.add('immerse-text-fading');
    this._badgeTextTimeout = setTimeout(() => {
      if (this.dom?.badgeText) {
        this.dom.badgeText.textContent = text;
        this.dom.badgeText.classList.remove('immerse-text-fading');
      }
    }, 120);
  }

  /**
   * Smoothly updates photo counter text with a liquid glide transition.
   *
   * @param {string} text
   */
  _updateCounterText(text) {
    if (!this.dom?.counterText) return;
    if (this.dom.counterText.textContent === text) return;

    if (this._counterTextTimeout) clearTimeout(this._counterTextTimeout);

    this.dom.counterText.classList.add('immerse-text-fading');
    this._counterTextTimeout = setTimeout(() => {
      if (this.dom?.counterText) {
        this.dom.counterText.textContent = text;
        this.dom.counterText.classList.remove('immerse-text-fading');
      }
    }, 120);
  }

  /* ---------------- Zoom & Pan Transforms managed by ZoomPanController ---------------- */
  /* ---------------- Events and Idle Timers managed by EventsController ---------------- */
}
