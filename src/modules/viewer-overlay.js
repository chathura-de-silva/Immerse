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

export class ViewerOverlay {
  constructor(options = {}) {
    this.options = options;
    this.onLoadMore = options.onLoadMore || null;
    this.onClose = options.onClose || null;
    this.isOpen = false;
    this._isTransitioning = false;
    this._isLoading = false;

    // Posts & Slide state
    this.posts = []; // Array of { id, tile, slides: [{ url, width, height, element }] }
    this.currentPostIndex = 0;
    this.currentSlideIndex = 0;
    this._pendingNavigation = null; // { type: 'post' | 'slide', direction: number, fromPostIndex?: number, targetSlideIndex?: number }
    this._navPollInterval = null;
    this._loadMoreRetryInterval = null;
    this._activeLoadingImg = null;

    // Pan & Zoom state
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.minScale = 0.5;
    this.maxScale = 6;

    // Idle auto-hide timer & navigation debounce
    this._idleTimer = null;
    this._cursorTimer = null;
    this._spinnerTimeout = null;
    this._badgeTextTimeout = null;
    this._counterTextTimeout = null;
    this._lastNavTime = 0;
    this._navDirection = 1;
    this.dom = null;

    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleWheel = this._handleWheel.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleDblClick = this._handleDblClick.bind(this);
    this._handleRootMouseMove = this._handleRootMouseMove.bind(this);
    this._handleRootPointerDown = this._handleRootPointerDown.bind(this);
    this._resetIdleTimer = this._resetIdleTimer.bind(this);
    this._wakeCursor = this._wakeCursor.bind(this);
  }

  /**
   * Builds the DOM elements for the overlay with modern frosted glass styling.
   */
  _ensureDom() {
    if (this.dom) return;

    // Overlay Root
    const root = createElement('div', {
      className: 'immerse-overlay-root',
      attributes: { 'aria-modal': 'true', role: 'dialog' }
    });

    // Deep optical backdrop
    const backdrop = createElement('div', {
      className: 'immerse-backdrop',
      events: { click: (e) => {
        if (e.target === backdrop || e.target === stage) this.close();
      }}
    });

    // Header bar
    const header = createElement('div', { className: 'immerse-header' });

    // Resolution badge (default off, clean text without green dot)
    const badgeText = createElement('span', {
      className: 'immerse-badge-text',
      textContent: 'Ultra-HD'
    });
    const showBadge = !!this.options.showResolutionBadge;
    const badge = createElement('div', {
      className: 'immerse-badge',
      style: { display: showBadge ? 'inline-flex' : 'none' }
    });
    badge.append(badgeText);

    // Photo counter pill (e.g. "Photo 1")
    const counterText = createElement('span', {
      className: 'immerse-counter-text',
      textContent: 'Photo 1'
    });
    const counter = createElement('div', { className: 'immerse-counter' });
    counter.append(counterText);

    // Header left container (anchors info pills on the left)
    const headerLeft = createElement('div', { className: 'immerse-header-left' });
    headerLeft.append(badge, counter);

    // Header controls group
    const controls = createElement('div', { className: 'immerse-controls' });

    // View post button (opens native Instagram post in a new tab)
    const viewPostBtn = createElement('button', {
      className: 'immerse-btn immerse-btn-view-post',
      innerHTML: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
      attributes: { title: 'View Post on Instagram (V)', 'aria-label': 'View Post on Instagram' },
      events: { click: () => this.openPostOnInstagram() }
    });

    // Zoom reset button
    const zoomResetBtn = createElement('button', {
      className: 'immerse-btn immerse-btn-zoom',
      textContent: '100%',
      attributes: { title: 'Reset zoom (0)', 'aria-label': 'Reset zoom' },
      events: { click: () => this.resetTransform() }
    });

    // Fullscreen button
    const fullscreenBtn = createElement('button', {
      className: 'immerse-btn immerse-btn-fullscreen',
      innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
      attributes: { title: 'Toggle Fullscreen (F)', 'aria-label': 'Toggle Fullscreen' },
      events: { click: () => this.toggleNativeFullscreen() }
    });

    // Close button
    const closeBtn = createElement('button', {
      className: 'immerse-btn immerse-btn-close',
      innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      attributes: { title: 'Close (Esc)', 'aria-label': 'Close' },
      events: { click: () => this.close() }
    });

    controls.append(viewPostBtn, zoomResetBtn, fullscreenBtn, closeBtn);
    header.append(headerLeft, controls);

    // Stage area
    const stage = createElement('div', {
      className: 'immerse-stage',
      events: {
        wheel: this._handleWheel,
        mousedown: this._handleMouseDown,
        dblclick: this._handleDblClick
      }
    });

    // Primary Navigation Buttons: Navigate between POSTS in the grid
    const prevPostBtn = createElement('button', {
      className: 'immerse-nav-btn immerse-nav-prev',
      innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
      attributes: { title: 'Previous Post (Left Arrow)', 'aria-label': 'Previous Post' },
      events: {
        click: (e) => { e.stopPropagation(); this.prevPost(); },
        dblclick: (e) => { e.stopPropagation(); e.preventDefault(); }
      }
    });

    const nextPostBtn = createElement('button', {
      className: 'immerse-nav-btn immerse-nav-next',
      innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
      attributes: { title: 'Next Post (Right Arrow)', 'aria-label': 'Next Post' },
      events: {
        click: (e) => { e.stopPropagation(); this.nextPost(); },
        dblclick: (e) => { e.stopPropagation(); e.preventDefault(); }
      }
    });

    // Image container & protected element with dual-layer crossfade buffer
    const imgWrapper = createElement('div', { className: 'immerse-image-wrapper' });

    const imgPrev = createElement('img', {
      className: 'immerse-image immerse-image-prev',
      attributes: { draggable: 'false' },
      style: { opacity: '0', display: 'none', pointerEvents: 'none' }
    });

    const img = createElement('img', {
      className: 'immerse-image immerse-image-curr',
      attributes: { draggable: 'false' },
      style: { opacity: '0', pointerEvents: 'none' }
    });

    const shield = createElement('div', {
      className: 'immerse-shield',
      attributes: { 'aria-hidden': 'true' }
    });

    const spinner = createElement('div', {
      className: 'immerse-spinner',
      innerHTML: '<div class="immerse-spinner-ring"></div>'
    });

    imgWrapper.append(imgPrev, img, shield, spinner);

    // Secondary Navigation: Carousel Slide Controller (Slides within current post)
    const carouselCtrl = createElement('div', {
      className: 'immerse-carousel-controller',
      style: { display: 'none' }
    });

    const prevSlideBtn = createElement('button', {
      className: 'immerse-carousel-btn',
      innerHTML: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
      attributes: { title: 'Previous Slide (Up Arrow)', 'aria-label': 'Previous Slide' },
      events: {
        click: (e) => { e.stopPropagation(); this.prevSlide(); },
        dblclick: (e) => { e.stopPropagation(); e.preventDefault(); }
      }
    });

    const dotsContainer = createElement('div', { className: 'immerse-dots' });

    const nextSlideBtn = createElement('button', {
      className: 'immerse-carousel-btn',
      innerHTML: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
      attributes: { title: 'Next Slide (Down Arrow)', 'aria-label': 'Next Slide' },
      events: {
        click: (e) => { e.stopPropagation(); this.nextSlide(); },
        dblclick: (e) => { e.stopPropagation(); e.preventDefault(); }
      }
    });

    const carouselLabel = createElement('span', {
      className: 'immerse-carousel-label',
      textContent: 'Slide 1/1'
    });

    carouselCtrl.append(prevSlideBtn, dotsContainer, carouselLabel, nextSlideBtn);
    stage.append(prevPostBtn, imgWrapper, nextPostBtn, carouselCtrl);
    root.append(backdrop, header, stage);

    // Copyright protection: block context menus, drag-and-drop, and selection
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    root.addEventListener('dragstart', (e) => e.preventDefault());
    root.addEventListener('selectstart', (e) => e.preventDefault());

    this.dom = {
      root,
      backdrop,
      header,
      badge,
      badgeText,
      counter,
      counterText,
      viewPostBtn,
      zoomResetBtn,
      fullscreenBtn,
      closeBtn,
      stage,
      prevPostBtn,
      nextPostBtn,
      imgWrapper,
      imgPrev,
      img,
      shield,
      spinner,
      carouselCtrl,
      prevSlideBtn,
      nextSlideBtn,
      dotsContainer,
      carouselLabel
    };

    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
    root.addEventListener('mousemove', this._handleRootMouseMove);
    root.addEventListener('pointerdown', this._handleRootPointerDown);
    document.addEventListener('fullscreenchange', () => this._updateFullscreenButtonState());
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
    this.posts = posts;
    this.currentPostIndex = Math.max(0, Math.min(startPostIndex, posts.length - 1));
    this.currentSlideIndex = startSlideIndex;

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
      this._resetIdleTimer();
      this._wakeCursor();
      this._enterNativeFullscreen();
      this._updateFullscreenButtonState();
    });

    this.isOpen = true;
    document.addEventListener('keydown', this._handleKeyDown, true);

    this.loadCurrent();
  }

  /**
   * Closes the lightbox overlay.
   */
  close() {
    if (!this.isOpen || !this.dom) return;

    this.dom.root.classList.remove('immerse-active');
    this.dom.root.classList.remove('immerse-controls-hidden');
    this.dom.root.classList.remove('immerse-cursor-hidden');
    document.removeEventListener('keydown', this._handleKeyDown, true);

    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }

    if (this._cursorTimer) {
      clearTimeout(this._cursorTimer);
      this._cursorTimer = null;
    }

    if (this._spinnerTimeout) {
      clearTimeout(this._spinnerTimeout);
      this._spinnerTimeout = null;
    }

    if (this._badgeTextTimeout) {
      clearTimeout(this._badgeTextTimeout);
      this._badgeTextTimeout = null;
    }

    if (this._counterTextTimeout) {
      clearTimeout(this._counterTextTimeout);
      this._counterTextTimeout = null;
    }

    if (this._waitingTimeout) {
      clearTimeout(this._waitingTimeout);
      this._waitingTimeout = null;
    }

    if (this._navPollInterval) {
      clearInterval(this._navPollInterval);
      this._navPollInterval = null;
    }

    if (this._loadMoreRetryInterval) {
      clearInterval(this._loadMoreRetryInterval);
      this._loadMoreRetryInterval = null;
    }

    this._pendingNavigation = null;
    this._activeLoadingImg = null;

    this.isOpen = false;
    this._completeTransitionImmediately();
    this.resetTransform();

    if (this.dom?.img) {
      this.dom.img.src = '';
      this.dom.img.style.opacity = '0';
    }
    if (this.dom?.imgPrev) {
      this.dom.imgPrev.src = '';
      this.dom.imgPrev.style.display = 'none';
      this.dom.imgPrev.style.opacity = '0';
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
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
    if (!newPosts || newPosts.length === 0) return;

    // Maintain currentPostIndex aligned with the currently active post
    const activePost = this.posts[this.currentPostIndex];
    if (activePost) {
      const newActiveIdx = newPosts.findIndex(p => p.id === activePost.id || (p.tile && p.tile === activePost.tile));
      if (newActiveIdx !== -1) {
        this.currentPostIndex = newActiveIdx;
      }
    }

    this.posts = newPosts;

    // Auto-advance to pending post as soon as new post arrives in feed
    if (this._pendingNavigation && this._pendingNavigation.type === 'post') {
      const nextTargetIdx = this._pendingNavigation.fromPostIndex + 1;
      if (this.posts.length > nextTargetIdx) {
        this._pendingNavigation = null;
        if (this._waitingTimeout) {
          clearTimeout(this._waitingTimeout);
          this._waitingTimeout = null;
        }
        if (this._loadMoreRetryInterval) {
          clearInterval(this._loadMoreRetryInterval);
          this._loadMoreRetryInterval = null;
        }
        this.dom.spinner.classList.remove('immerse-spinner-visible');
        this.goToPost(nextTargetIdx, 0);
        return;
      }
    }

    this._updateHeaderCounter();
    const curr = this.posts[this.currentPostIndex];
    if (curr) {
      this._updateCarouselControls(curr);
    }
  }

  /**
   * Synchronizes and accumulates any newly mounted slides for the given post.
   *
   * @param {Object} post
   */
  _syncPostSlides(post) {
    if (!post || !post.tile) return;
    if (!isFeedContext(post.tile)) {
      post.isCarousel = false;
      post.totalSlides = 1;
      return;
    }
    const postImages = findPostImages(post.tile);
    const seenUrls = new Set(post.slides.map(s => s.url));

    for (const imgEl of postImages) {
      const url = getHighestResolutionUrl(imgEl);
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        post.slides.push({
          url,
          width: imgEl.naturalWidth || 1080,
          height: imgEl.naturalHeight || 1080,
          element: imgEl
        });
      }
    }

    if (!post.isCarousel) {
      post.isCarousel = post.slides.length > 1 || isCarouselPost(post.tile);
    }
    const estCount = getEstimatedSlideCount(post.tile);
    post.totalSlides = Math.max(post.totalSlides || 0, estCount, post.slides.length);
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

  /**
   * Loads the current post and current slide into view with seamless GPU-accelerated crossfading.
   */
  loadCurrent() {
    const post = this.posts[this.currentPostIndex];
    if (!post || !post.slides || post.slides.length === 0) return;

    // Immediately resolve any pending transition to settled state
    this._completeTransitionImmediately();

    if (this._spinnerTimeout) {
      clearTimeout(this._spinnerTimeout);
      this._spinnerTimeout = null;
    }

    this._syncPostSlides(post);
    this.currentSlideIndex = Math.max(0, Math.min(this.currentSlideIndex, post.slides.length - 1));
    const slide = post.slides[this.currentSlideIndex];

    // Only proactively request more posts when directly on the very last loaded post
    if (this.currentPostIndex >= this.posts.length - 1 && this.onLoadMore) {
      this.onLoadMore();
    }

    this.resetZoomState();
    this._updateHeaderCounter();
    this._updateCarouselControls(post);

    // If already showing this exact slide, don't re-trigger flash/animation
    if (this.dom.img.src === slide.url && this.dom.img.style.opacity === '1') {
      this._preloadAdjacent();
      return;
    }

    const targetPostIndex = this.currentPostIndex;
    const targetSlideIndex = this.currentSlideIndex;
    this._isLoading = true;

    // Show loading spinner quickly if image is not already in memory cache (80ms threshold)
    this._spinnerTimeout = setTimeout(() => {
      if (this._isLoading && this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
        this.dom.spinner.classList.add('immerse-spinner-visible');
        if (this.options.showResolutionBadge) {
          this._updateBadgeText('Loading HD...');
        }
      }
    }, 80);

    if (this._activeLoadingImg) {
      this._activeLoadingImg.onload = null;
      this._activeLoadingImg.onerror = null;
      this._activeLoadingImg = null;
    }

    const tempImg = new Image();
    this._activeLoadingImg = tempImg;

    const onReady = async () => {
      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;

      if (this._spinnerTimeout) {
        clearTimeout(this._spinnerTimeout);
        this._spinnerTimeout = null;
      }
      this._isLoading = false;
      this._activeLoadingImg = null;
      this.dom.spinner.classList.remove('immerse-spinner-visible');

      // Ensure bitmap is fully decoded in memory before swapping
      if (tempImg.decode) {
        await tempImg.decode().catch(() => {});
      }

      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;

      // Identify currently visible image to smoothly transition from
      const prevUrl = (this.dom.img.src && this.dom.img.style.opacity !== '0' && this.dom.img.style.display !== 'none')
        ? this.dom.img.src
        : null;
      const hasPrev = !!prevUrl;
      const dir = this._navDirection || 1;
      const isFlat = this.options.transitionStyle === 'flat' || this.options.transitionStyle === 'slide';

      if (hasPrev) {
        this._isTransitioning = true;

        // Clone current image state onto previous layer at exact same geometry before updating current
        this.dom.imgPrev.src = prevUrl;
        this.dom.imgPrev.style.display = 'block';
        this.dom.imgPrev.style.transition = 'none';
        this.dom.imgPrev.style.transform = 'translate3d(0, 0, 0)';
        this.dom.imgPrev.style.filter = 'none';
        this.dom.imgPrev.style.opacity = '1';
        this.dom.imgPrev.style.zIndex = '1';

        // Assign newly decoded asset to current image element
        this.dom.img.src = slide.url;

        const viewWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0, 1920);
        const slideOffset = dir * viewWidth;

        let incomingStartTransform = '';
        let outgoingEndTransform = '';
        let outgoingEndOpacity = '0';
        let outgoingFilter = 'none';
        let incomingShadow = 'none';
        let easing = '';
        let duration = '';

        if (isFlat) {
          // Flat Continuous Horizontal Slide:
          // Both slides translate across the entire viewport in lockstep at full opacity without depth scale
          incomingStartTransform = `translate3d(${slideOffset}px, 0, 0)`;
          outgoingEndTransform = `translate3d(${-slideOffset}px, 0, 0)`;
          outgoingEndOpacity = '1';
          outgoingFilter = 'none';
          incomingShadow = 'none';
          easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
          duration = '0.44s';
        } else {
          // Deep Multi-Plane 3D Parallax:
          // Incoming foreground slide sweeps in with deep, ambient drop shadow
          // Outgoing background slide recedes deep into 3D space (scale 0.70), drifts slowly (14% viewport), dims and softly blurs into distance
          incomingStartTransform = `translate3d(${slideOffset}px, 0, 0)`;
          outgoingEndTransform = `translate3d(${-dir * Math.round(viewWidth * 0.14)}px, 0, 0) scale(0.70)`;
          outgoingEndOpacity = '0';
          outgoingFilter = 'brightness(0.38) blur(1.5px)';
          incomingShadow = dir > 0
            ? '-36px 0 90px rgba(0, 0, 0, 0.92), -10px 0 28px rgba(0, 0, 0, 0.75)'
            : '36px 0 90px rgba(0, 0, 0, 0.92), 10px 0 28px rgba(0, 0, 0, 0.75)';
          easing = 'cubic-bezier(0.16, 1, 0.28, 1)';
          duration = '0.54s';
        }

        // Apply starting states immediately without transition
        this.dom.img.style.transition = 'none';
        this.dom.img.style.transform = incomingStartTransform;
        this.dom.img.style.boxShadow = incomingShadow;
        this.dom.img.style.opacity = '1';
        this.dom.img.style.zIndex = '2';

        // Force reflow
        void this.dom.img.offsetWidth;

        requestAnimationFrame(() => {
          this.dom.img.style.transition = `transform ${duration} ${easing}`;
          this.dom.imgPrev.style.transition = isFlat
            ? `transform ${duration} ${easing}`
            : `transform ${duration} ${easing}, opacity ${duration} ${easing}, filter ${duration} ${easing}`;

          this.dom.img.style.transform = 'translate3d(0, 0, 0)';
          this.dom.imgPrev.style.transform = outgoingEndTransform;
          this.dom.imgPrev.style.opacity = outgoingEndOpacity;
          this.dom.imgPrev.style.filter = outgoingFilter;
        });

        // Cleanup previous image layer after transition finishes
        this._transitionTimeout = setTimeout(() => {
          if (this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
            this.dom.imgPrev.style.display = 'none';
            this.dom.imgPrev.style.transform = 'none';
            this.dom.imgPrev.style.opacity = '0';
            this.dom.imgPrev.style.filter = 'none';
            this.dom.img.style.boxShadow = 'none';
            this.dom.img.style.transition = 'opacity 0.28s var(--immerse-smooth)';
            this._isTransitioning = false;
          }
        }, isFlat ? 470 : 570);
      } else {
        // Initial load: assign asset and fade in center
        this.dom.img.src = slide.url;
        this.dom.img.style.transition = 'opacity 0.32s var(--immerse-smooth)';
        this.dom.img.style.transform = 'translate3d(0, 0, 0)';
        this.dom.img.style.boxShadow = 'none';
        requestAnimationFrame(() => {
          this.dom.img.style.opacity = '1';
        });
      }

      const w = tempImg.naturalWidth;
      const h = tempImg.naturalHeight;
      this._updateBadgeText(`${w} × ${h} • Highest Quality`);
      this._preloadAdjacent();
    };

    tempImg.onload = onReady;
    tempImg.onerror = () => {
      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;
      if (this._spinnerTimeout) clearTimeout(this._spinnerTimeout);
      this._isLoading = false;
      this._isTransitioning = false;
      this.dom.spinner.classList.remove('immerse-spinner-visible');
      this.dom.img.src = slide.url;
      this.dom.img.style.opacity = '1';
      this.dom.imgPrev.style.opacity = '0';
      this.dom.imgPrev.style.display = 'none';
      this._updateBadgeText('HD Ready');
    };

    tempImg.src = slide.url;
  }

  _updateHeaderCounter() {
    const post = this.posts[this.currentPostIndex];
    const isFeed = isFeedContext(post?.tile);

    if (isFeed) {
      this.dom.counter.style.display = 'none';
    } else {
      this.dom.counter.style.display = 'inline-flex';
      const currentPostNum = this.currentPostIndex + 1;
      this._updateCounterText(`Photo ${currentPostNum}`);
    }

    if (this.dom?.viewPostBtn) {
      const url = this.getCurrentPostUrl();
      this.dom.viewPostBtn.style.display = url ? 'inline-flex' : 'none';
    }

    this.dom.prevPostBtn.disabled = this.currentPostIndex === 0;
    // Keep next button clickable so user can trigger load-more at the end
    this.dom.nextPostBtn.disabled = false;
  }

  /**
   * Resolves the Instagram permalink URL for the currently active post.
   *
   * @returns {string|null}
   */
  getCurrentPostUrl() {
    const post = this.posts[this.currentPostIndex];
    if (!post) return null;

    const tile = post.tile;
    if (tile) {
      const link = (tile.matches && tile.matches('a[href*="/p/"], a[href*="/reel/"]'))
        ? tile.getAttribute('href')
        : (tile.querySelector ? tile.querySelector('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute('href') : null)
          || (tile.closest ? tile.closest('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute('href') : null);
      if (link) {
        if (link.startsWith('http')) return link;
        return `https://www.instagram.com${link.startsWith('/') ? '' : '/'}${link}`;
      }
    }

    if (post.id && typeof post.id === 'string' && post.id.startsWith('post_')) {
      const code = post.id.slice(5);
      return `https://www.instagram.com/p/${code}/`;
    }

    return null;
  }

  /**
   * Opens the currently active post's native Instagram permalink in a new browser tab.
   */
  openPostOnInstagram() {
    const url = this.getCurrentPostUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  _updateCarouselControls(post) {
    const isFeed = isFeedContext(post?.tile);

    // Suppress carousel navigator completely when in profile view, even for carousel posts
    if (!isFeed || !post || (!post.isCarousel && post.slides.length <= 1)) {
      this.dom.carouselCtrl.style.display = 'none';
      return;
    }

    this.dom.carouselCtrl.style.display = 'flex';
    const totalSlides = Math.max(post.totalSlides || 0, post.slides.length);
    const currentSlideNum = this.currentSlideIndex + 1;

    this.dom.carouselLabel.textContent = `Slide ${currentSlideNum} of ${totalSlides}`;
    this.dom.prevSlideBtn.disabled = this.currentSlideIndex === 0;

    // Check if further slides exist in memory or via native carousel next button
    const hasNativeNext = !!findNativeCarouselNextButton(post.tile);
    const hasMore = this.currentSlideIndex < totalSlides - 1 || hasNativeNext;
    this.dom.nextSlideBtn.disabled = !hasMore;

    // Render slide dots
    this.dom.dotsContainer.innerHTML = '';
    const dotsCount = Math.max(totalSlides, post.slides.length);
    for (let i = 0; i < dotsCount; i++) {
      const dot = createElement('div', {
        className: `immerse-dot ${i === this.currentSlideIndex ? 'immerse-dot-active' : ''}`,
        attributes: { title: `Go to slide ${i + 1}` },
        events: {
          click: (e) => {
            e.stopPropagation();
            this.goToSlide(i);
          }
        }
      });
      this.dom.dotsContainer.appendChild(dot);
    }
  }

  _preloadAdjacent() {
    if (!this.posts || this.posts.length === 0) return;

    // Bidirectional preloading window (±2 posts)
    const targetIndices = [
      this.currentPostIndex - 2,
      this.currentPostIndex - 1,
      this.currentPostIndex + 1,
      this.currentPostIndex + 2
    ];

    for (const idx of targetIndices) {
      if (idx >= 0 && idx < this.posts.length) {
        const p = this.posts[idx];
        if (p?.slides?.[0]?.url) {
          const pre = new Image();
          pre.src = p.slides[0].url;
        }
      }
    }

    // Preload both previous and next slide of current post carousel (feed only)
    const post = this.posts[this.currentPostIndex];
    if (post && post.slides && isFeedContext(post.tile)) {
      if (post.slides[this.currentSlideIndex - 1]?.url) {
        const pre = new Image();
        pre.src = post.slides[this.currentSlideIndex - 1].url;
      }
      if (post.slides[this.currentSlideIndex + 1]?.url) {
        const pre = new Image();
        pre.src = post.slides[this.currentSlideIndex + 1].url;
      }
    }
  }

  /* ---------------- Primary Navigation: Grid Posts ---------------- */

  nextPost() {
    this._lastNavTime = Date.now();
    this._navDirection = 1;
    this.resetZoomState();
    if (this.currentPostIndex < this.posts.length - 1) {
      this.goToPost(this.currentPostIndex + 1, 0);
    } else {
      // Pending next post: record intent, show spinner, and auto-navigate once loaded
      this._pendingNavigation = {
        type: 'post',
        direction: 1,
        fromPostIndex: this.currentPostIndex
      };
      this.dom.spinner.classList.add('immerse-spinner-visible');

      if (this.onLoadMore) {
        this.onLoadMore();

        // Responsive retry poll: if Instagram hasn't hydrated new items yet, re-trigger
        if (this._loadMoreRetryInterval) clearInterval(this._loadMoreRetryInterval);
        let retries = 0;
        this._loadMoreRetryInterval = setInterval(() => {
          retries++;
          if (this._pendingNavigation?.type === 'post') {
            if (this.posts.length > this._pendingNavigation.fromPostIndex + 1) {
              const target = this._pendingNavigation.fromPostIndex + 1;
              this._pendingNavigation = null;
              clearInterval(this._loadMoreRetryInterval);
              this._loadMoreRetryInterval = null;
              if (this._waitingTimeout) {
                clearTimeout(this._waitingTimeout);
                this._waitingTimeout = null;
              }
              this.dom.spinner.classList.remove('immerse-spinner-visible');
              this.goToPost(target, 0);
            } else if (retries < 6) {
              this.onLoadMore();
            } else {
              clearInterval(this._loadMoreRetryInterval);
              this._loadMoreRetryInterval = null;
            }
          } else {
            clearInterval(this._loadMoreRetryInterval);
            this._loadMoreRetryInterval = null;
          }
        }, 750);
      }

      if (this._waitingTimeout) clearTimeout(this._waitingTimeout);
      this._waitingTimeout = setTimeout(() => {
        if (this._pendingNavigation?.type === 'post') {
          this._pendingNavigation = null;
          this.dom.spinner.classList.remove('immerse-spinner-visible');
        }
        if (this._loadMoreRetryInterval) {
          clearInterval(this._loadMoreRetryInterval);
          this._loadMoreRetryInterval = null;
        }
      }, 7000);
    }
  }

  prevPost() {
    this._lastNavTime = Date.now();
    this._navDirection = -1;
    this.resetZoomState();
    this._pendingNavigation = null;
    if (this._loadMoreRetryInterval) {
      clearInterval(this._loadMoreRetryInterval);
      this._loadMoreRetryInterval = null;
    }
    if (this.currentPostIndex > 0) {
      this.goToPost(this.currentPostIndex - 1, 0);
    }
  }

  goToPost(postIndex, slideIndex = 0) {
    this._lastNavTime = Date.now();
    this._navDirection = postIndex >= this.currentPostIndex ? 1 : -1;
    this.resetZoomState();
    this.currentPostIndex = postIndex;
    this.currentSlideIndex = slideIndex;
    this.loadCurrent();
  }

  /* ---------------- Secondary Navigation: Carousel Slides ---------------- */

  nextSlide() {
    const post = this.posts[this.currentPostIndex];
    if (!post || !isFeedContext(post.tile)) return;
    this._lastNavTime = Date.now();
    this._navDirection = 1;
    this.resetZoomState();

    if (this.currentSlideIndex < post.slides.length - 1) {
      this.goToSlide(this.currentSlideIndex + 1);
      this._prefetchNextNativeSlide(post);
      return;
    }

    // End of collected slides: request next slide from Instagram and auto-navigate once loaded
    const targetSlide = this.currentSlideIndex + 1;
    this._pendingNavigation = {
      type: 'slide',
      direction: 1,
      targetSlideIndex: targetSlide
    };
    this.dom.spinner.classList.add('immerse-spinner-visible');
    this._advanceNativeCarouselAndGo(post, targetSlide);
  }

  prevSlide() {
    const post = this.posts[this.currentPostIndex];
    if (!post || !isFeedContext(post.tile)) return;
    this._lastNavTime = Date.now();
    this._navDirection = -1;
    this.resetZoomState();
    this._pendingNavigation = null;
    if (this._navPollInterval) {
      clearInterval(this._navPollInterval);
      this._navPollInterval = null;
    }
    if (this.currentSlideIndex > 0) {
      this.goToSlide(this.currentSlideIndex - 1);
    }
  }

  goToSlide(slideIndex) {
    const post = this.posts[this.currentPostIndex];
    if (!post || !isFeedContext(post.tile)) return;
    this._lastNavTime = Date.now();
    this._navDirection = slideIndex >= this.currentSlideIndex ? 1 : -1;
    this.resetZoomState();

    if (slideIndex < post.slides.length) {
      this.currentSlideIndex = slideIndex;
      this.loadCurrent();
    } else {
      this._advanceNativeCarouselAndGo(post, slideIndex);
    }
  }

  _advanceNativeCarouselAndGo(post, targetSlideIndex) {
    const nativeNext = findNativeCarouselNextButton(post.tile);
    if (!nativeNext) {
      if (this._pendingNavigation?.type === 'slide') {
        this._pendingNavigation = null;
        this.dom.spinner.classList.remove('immerse-spinner-visible');
      }
      return;
    }

    nativeNext.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    nativeNext.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    if (this._navPollInterval) clearInterval(this._navPollInterval);
    let attempts = 0;
    this._navPollInterval = setInterval(() => {
      attempts++;
      this._syncPostSlides(post);

      if (post.slides.length > targetSlideIndex) {
        clearInterval(this._navPollInterval);
        this._navPollInterval = null;
        this._pendingNavigation = null;
        this.dom.spinner.classList.remove('immerse-spinner-visible');
        this.goToSlide(targetSlideIndex);
      } else if (attempts >= 45) { // 45 * 60ms = 2.7s window
        clearInterval(this._navPollInterval);
        this._navPollInterval = null;
        if (this._pendingNavigation?.type === 'slide') {
          this._pendingNavigation = null;
          this.dom.spinner.classList.remove('immerse-spinner-visible');
        }
        this._updateCarouselControls(post);
      }
    }, 60);
  }

  _prefetchNextNativeSlide(post) {
    const nativeNext = findNativeCarouselNextButton(post.tile);
    if (!nativeNext) return;

    if (this.currentSlideIndex >= post.slides.length - 2) {
      nativeNext.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      nativeNext.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      setTimeout(() => {
        this._syncPostSlides(post);
        this._updateCarouselControls(post);
      }, 80);
    }
  }

  /**
   * Instantly settles any running slide transition to prevent intermediate visual tearing or glitches.
   */
  _completeTransitionImmediately() {
    if (this._transitionTimeout) {
      clearTimeout(this._transitionTimeout);
      this._transitionTimeout = null;
    }
    if (this.dom?.imgPrev) {
      this.dom.imgPrev.style.transition = 'none';
      this.dom.imgPrev.style.display = 'none';
      this.dom.imgPrev.style.transform = 'none';
      this.dom.imgPrev.style.filter = 'none';
      this.dom.imgPrev.style.opacity = '0';
    }
    if (this.dom?.img) {
      this.dom.img.style.transition = 'none';
      this.dom.img.style.transform = 'translate3d(0, 0, 0)';
      this.dom.img.style.boxShadow = 'none';
      this.dom.img.style.opacity = '1';
    }
    this._isTransitioning = false;
  }

  /* ---------------- Zoom & Pan Transforms ---------------- */

  resetZoomState() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    if (this.dom?.zoomResetBtn) {
      this.dom.zoomResetBtn.textContent = '100%';
    }
    if (this.dom?.stage) {
      this.dom.stage.classList.remove('immerse-can-pan', 'immerse-is-panning');
    }
  }

  resetTransform() {
    this.resetZoomState();
    this._applyTransform(true);
  }

  _applyTransform(smooth = false) {
    if (!this.dom?.img) return;

    if (smooth) {
      this.dom.img.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1), opacity 0.28s var(--immerse-smooth)';
    } else {
      this.dom.img.style.transition = 'opacity 0.28s var(--immerse-smooth)';
    }

    this.dom.img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.dom.zoomResetBtn.textContent = `${Math.round(this.scale * 100)}%`;

    if (this.scale > 1.05) {
      this.dom.stage.classList.add('immerse-can-pan');
    } else {
      this.dom.stage.classList.remove('immerse-can-pan', 'immerse-is-panning');
    }
  }

  _handleWheel(e) {
    if (!this.isOpen) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.options.wheelZoom === false) return;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));

    if (newScale === this.scale) return;

    const rect = this.dom.stage.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    const ratio = newScale / this.scale;
    this.panX = mouseX - (mouseX - this.panX) * ratio;
    this.panY = mouseY - (mouseY - this.panY) * ratio;
    this.scale = newScale;

    if (this.scale <= 1) {
      this.panX = 0;
      this.panY = 0;
    }

    this._applyTransform(false);
  }

  _handleMouseDown(e) {
    if (!this.isOpen || e.button !== 0) return;
    if (this.scale <= 1) return;

    this.isDragging = true;
    this.startX = e.clientX - this.panX;
    this.startY = e.clientY - this.panY;
    this.dom.stage.classList.add('immerse-is-panning');
    e.preventDefault();
  }

  _handleMouseMove(e) {
    if (!this.isDragging) return;
    this.panX = e.clientX - this.startX;
    this.panY = e.clientY - this.startY;
    this._applyTransform(false);
  }

  _handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.dom?.stage.classList.remove('immerse-is-panning');
    }
  }

  _handleDblClick(e) {
    if (!this.isOpen) return;

    // Only allow double-click to zoom directly on the image shield or image wrapper
    const isImageTarget = e.target === this.dom?.shield ||
                          e.target === this.dom?.img ||
                          e.target === this.dom?.imgWrapper;
    if (!isImageTarget) return;

    // Reject accidental double-clicks caused by rapid navigation clicks/keys
    if (Date.now() - this._lastNavTime < 350) return;

    e.preventDefault();

    if (this.scale > 1.1) {
      this.resetTransform();
    } else {
      this.scale = 2.5;
      const rect = this.dom.stage.getBoundingClientRect();
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      this.panX = -mouseX * 1.5;
      this.panY = -mouseY * 1.5;
      this._applyTransform(true);
    }
  }

  _handleKeyDown(e) {
    if (!this.isOpen) return;

    // Actively block save and copy shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Keyboard arrow keys navigate without waking up auto-hidden controls
    const isArrowNav = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'J', 'l', 'L', '[', ']'].includes(e.key);
    if (!isArrowNav) {
      this._resetIdleTimer();
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;

      // Primary Navigation (Posts in Grid)
      case 'ArrowRight':
      case 'l':
      case 'L':
        e.preventDefault();
        this.nextPost();
        break;
      case 'ArrowLeft':
      case 'j':
      case 'J':
        e.preventDefault();
        this.prevPost();
        break;

      // Secondary Navigation (Carousel Slides of Current Post)
      case 'ArrowDown':
      case ']':
        e.preventDefault();
        this.nextSlide();
        break;
      case 'ArrowUp':
      case '[':
        e.preventDefault();
        this.prevSlide();
        break;

      case 'f':
      case 'F':
        e.preventDefault();
        this.toggleNativeFullscreen();
        break;
      case 'v':
      case 'V':
        e.preventDefault();
        this.openPostOnInstagram();
        break;
      case '0':
        e.preventDefault();
        this.resetTransform();
        break;
      case '+':
      case '=':
        e.preventDefault();
        this.scale = Math.min(this.maxScale, this.scale * 1.25);
        this._applyTransform(true);
        break;
      case '-':
      case '_':
        e.preventDefault();
        this.scale = Math.max(this.minScale, this.scale / 1.25);
        if (this.scale <= 1) { this.panX = 0; this.panY = 0; }
        this._applyTransform(true);
        break;
    }
  }

  /**
   * Determines if a mouse event's coordinates are situated directly inside the image bounds.
   *
   * @param {MouseEvent|PointerEvent} e
   * @returns {boolean}
   */
  _isCursorInsideImage(e) {
    if (!this.dom?.img || !this.isOpen) return false;

    // Direct hover on an interactive UI control is always treated as control interaction
    if (e.target?.closest?.('.immerse-header, .immerse-nav-btn, .immerse-carousel-controller, .immerse-btn')) {
      return false;
    }

    // Edge control trigger zones (top header, bottom carousel, side navigation arrows)
    // Moving cursor to extreme edges triggers controls even when zoomed in
    const edgeMarginX = 55;
    const edgeMarginY = 50;
    const isNearScreenEdge = (
      e.clientY <= edgeMarginY ||
      e.clientY >= window.innerHeight - edgeMarginY ||
      e.clientX <= edgeMarginX ||
      e.clientX >= window.innerWidth - edgeMarginX
    );
    if (isNearScreenEdge) {
      return false;
    }

    // Check if cursor coordinates fall inside the rendered image rectangle
    const activeImg = (this.dom.img.style.opacity !== '0' || !this.dom.imgPrev?.src) ? this.dom.img : this.dom.imgPrev;
    const rect = activeImg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  _handleRootMouseMove(e) {
    if (!this.isOpen) return;

    // Wake cursor pointer on mouse movement
    this._wakeCursor();

    // If mouse moves inside the image bounds, DO NOT wake controls or reset idle timer
    if (this._isCursorInsideImage(e)) {
      return;
    }

    // Moving outside the image bounds or over control trigger zones: wake controls
    this._resetIdleTimer();
  }

  _handleRootPointerDown(e) {
    if (!this.isOpen) return;

    this._wakeCursor();

    // Clicking inside the image (e.g. dragging to pan) does not wake controls
    if (this._isCursorInsideImage(e)) {
      return;
    }

    // Clicking outside the image or on controls wakes controls
    this._resetIdleTimer();
  }

  _wakeCursor() {
    if (!this.dom?.root) return;
    this.dom.root.classList.remove('immerse-cursor-hidden');

    if (this._cursorTimer) clearTimeout(this._cursorTimer);
    this._cursorTimer = setTimeout(() => {
      if (this.isOpen && !this.isDragging) {
        this.dom.root.classList.add('immerse-cursor-hidden');
      }
    }, 2800);
  }

  _resetIdleTimer() {
    if (!this.dom?.root) return;
    this.dom.root.classList.remove('immerse-controls-hidden');

    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (this.isOpen && !this.isDragging) {
        this.dom.root.classList.add('immerse-controls-hidden');
      }
    }, 3200);
  }

  _enterNativeFullscreen() {
    if (!document.fullscreenElement && this.dom?.root?.requestFullscreen) {
      this.dom.root.requestFullscreen().catch(() => {});
    }
  }

  _updateFullscreenButtonState() {
    if (!this.dom?.fullscreenBtn) return;
    const isFs = !!document.fullscreenElement;
    if (isFs) {
      this.dom.fullscreenBtn.title = 'Back to Browser View (F)';
      this.dom.fullscreenBtn.setAttribute('aria-label', 'Back to Browser View');
      this.dom.fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
    } else {
      this.dom.fullscreenBtn.title = 'Enter Fullscreen (F)';
      this.dom.fullscreenBtn.setAttribute('aria-label', 'Enter Fullscreen');
      this.dom.fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    }
  }

  toggleNativeFullscreen() {
    if (!document.fullscreenElement) {
      if (this.dom?.root?.requestFullscreen) {
        this.dom.root.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }
}
