/**
 * viewer-overlay.js
 * High-performance fullscreen lightbox overlay with clean separation between
 * grid post navigation (primary) and carousel slide navigation (secondary),
 * true infinite feed loading, and zero-fragile design.
 */

import { createElement } from '../utils/dom-helpers.js';

export class ViewerOverlay {
  constructor(options = {}) {
    this.options = options;
    this.onLoadMore = options.onLoadMore || null;
    this.isOpen = false;

    // Posts & Slide state
    this.posts = []; // Array of { id, tile, slides: [{ url, width, height, element }] }
    this.currentPostIndex = 0;
    this.currentSlideIndex = 0;
    this._waitingForNextPost = false;

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

    // Resolution badge
    const badgeDot = createElement('span', { className: 'immerse-badge-dot' });
    const badgeText = createElement('span', {
      className: 'immerse-badge-text',
      textContent: 'Ultra-HD'
    });
    const showBadge = this.options.showResolutionBadge !== false;
    const badge = createElement('div', {
      className: 'immerse-badge',
      style: { display: showBadge ? 'inline-flex' : 'none' }
    });
    badge.append(badgeDot, badgeText);

    // Photo counter pill (e.g. "Photo 1")
    const counterText = createElement('span', {
      className: 'immerse-counter-text',
      textContent: 'Photo 1'
    });
    const counter = createElement('div', { className: 'immerse-counter' });
    counter.append(counterText);

    // Header controls group
    const controls = createElement('div', { className: 'immerse-controls' });

    // Zoom reset button
    const zoomResetBtn = createElement('button', {
      className: 'immerse-btn immerse-btn-zoom',
      textContent: '100%',
      attributes: { title: 'Reset zoom (0)', 'aria-label': 'Reset zoom' },
      events: { click: () => this.resetTransform() }
    });

    // Fullscreen button
    const fullscreenBtn = createElement('button', {
      className: 'immerse-btn',
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

    controls.append(zoomResetBtn, fullscreenBtn, closeBtn);
    header.append(badge, counter, controls);

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
      badgeDot,
      badgeText,
      counter,
      counterText,
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

    if (!document.body.contains(this.dom.root)) {
      document.body.appendChild(this.dom.root);
    }

    requestAnimationFrame(() => {
      this.dom.root.classList.add('immerse-active');
      this._resetIdleTimer();
      this._wakeCursor();
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

    this.isOpen = false;
    this.resetTransform();

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
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
    const oldLength = this.posts.length;
    this.posts = newPosts;

    if (this._waitingForNextPost && this.posts.length > oldLength) {
      this._waitingForNextPost = false;
      this.goToPost(oldLength, 0);
    } else {
      this._updateHeaderCounter();
    }
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
      const showBadge = this.options.showResolutionBadge !== false;
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

    this.currentSlideIndex = Math.max(0, Math.min(this.currentSlideIndex, post.slides.length - 1));
    const slide = post.slides[this.currentSlideIndex];

    // Proactively trigger background loading when approaching the end of loaded posts
    if (this.currentPostIndex >= this.posts.length - 3 && this.onLoadMore) {
      this.onLoadMore();
    }

    this.resetTransform();
    this._updateHeaderCounter();
    this._updateCarouselControls(post);

    const targetPostIndex = this.currentPostIndex;
    const targetSlideIndex = this.currentSlideIndex;

    // Buffer previous image to eliminate black blinks and provide seamless crossfade
    if (this.dom.img.src && this.dom.img.style.opacity !== '0') {
      this.dom.imgPrev.src = this.dom.img.src;
      this.dom.imgPrev.style.display = 'block';
      this.dom.imgPrev.style.opacity = '1';
    }

    // Hide incoming layer until decoded (prevImg remains visible underneath)
    this.dom.img.style.opacity = '0';

    // Show spinner ONLY if image takes > 220ms to load (avoids flicker for cached/preloaded images)
    if (this._spinnerTimeout) clearTimeout(this._spinnerTimeout);
    this._spinnerTimeout = setTimeout(() => {
      if (this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
        this.dom.spinner.classList.add('immerse-spinner-visible');
        this.dom.badgeDot.classList.add('immerse-badge-dot-loading');
        this._updateBadgeText('Loading Ultra-HD...');
      }
    }, 220);

    const tempImg = new Image();

    const onReady = async () => {
      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;

      if (this._spinnerTimeout) {
        clearTimeout(this._spinnerTimeout);
        this._spinnerTimeout = null;
      }

      // Ensure bitmap is fully decoded in memory before swapping
      if (tempImg.decode) {
        await tempImg.decode().catch(() => {});
      }

      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;

      // Assign decoded asset to current image element
      this.dom.img.src = slide.url;

      const hasPrev = !!(this.dom.imgPrev.src && this.dom.imgPrev.style.display !== 'none');
      const dir = this._navDirection || 1;
      const isSlide = this.options.transitionStyle === 'slide';

      if (hasPrev) {
        let incomingStartTransform = '';
        let outgoingEndTransform = '';
        let incomingStartOpacity = '0';
        let outgoingEndOpacity = '0';
        let easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
        let duration = '0.32s';

        if (isSlide) {
          // Option B: Continuous 100% Horizontal Slide
          incomingStartTransform = `translate3d(${dir * 100}%, 0, 0)`;
          outgoingEndTransform = `translate3d(${-dir * 100}%, 0, 0)`;
          incomingStartOpacity = '1';
          outgoingEndOpacity = '0';
          easing = 'cubic-bezier(0.2, 0, 0, 1)';
          duration = '0.34s';
        } else {
          // Option A: Modern Cinematic Parallax Slide
          incomingStartTransform = `translate3d(${dir * 80}px, 0, 0) scale(1.02)`;
          outgoingEndTransform = `translate3d(${-dir * 80}px, 0, 0) scale(0.97)`;
          incomingStartOpacity = '0';
          outgoingEndOpacity = '0';
          easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
          duration = '0.32s';
        }

        // Apply starting states immediately without transition
        this.dom.img.style.transition = 'none';
        this.dom.img.style.transform = incomingStartTransform;
        this.dom.img.style.opacity = incomingStartOpacity;
        this.dom.imgPrev.style.transition = 'none';
        this.dom.imgPrev.style.transform = 'translate3d(0, 0, 0) scale(1)';
        this.dom.imgPrev.style.opacity = '1';

        // Force reflow
        void this.dom.img.offsetWidth;

        requestAnimationFrame(() => {
          this.dom.img.style.transition = `transform ${duration} ${easing}, opacity ${duration} ${easing}`;
          this.dom.imgPrev.style.transition = `transform ${duration} ${easing}, opacity ${duration} ${easing}`;

          this.dom.img.style.transform = 'translate3d(0, 0, 0) scale(1)';
          this.dom.img.style.opacity = '1';
          this.dom.imgPrev.style.transform = outgoingEndTransform;
          this.dom.imgPrev.style.opacity = outgoingEndOpacity;
        });
      } else {
        // Initial load: fade in center
        this.dom.img.style.transition = 'opacity 0.28s var(--immerse-smooth)';
        this.dom.img.style.transform = 'translate3d(0, 0, 0) scale(1)';
        requestAnimationFrame(() => {
          this.dom.img.style.opacity = '1';
        });
      }

      this.dom.spinner.classList.remove('immerse-spinner-visible');
      this.dom.badgeDot.classList.remove('immerse-badge-dot-loading');

      const w = tempImg.naturalWidth;
      const h = tempImg.naturalHeight;
      this._updateBadgeText(`${w} × ${h} • Highest Quality`);

      // Cleanup previous image layer after transition finishes
      setTimeout(() => {
        if (this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
          this.dom.imgPrev.style.display = 'none';
          this.dom.imgPrev.style.transform = 'none';
          this.dom.imgPrev.style.opacity = '0';
          this.dom.img.style.transition = 'opacity 0.28s var(--immerse-smooth)';
        }
      }, 360);

      this._preloadAdjacent();
    };

    tempImg.onload = onReady;
    tempImg.onerror = () => {
      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;
      if (this._spinnerTimeout) clearTimeout(this._spinnerTimeout);
      this.dom.spinner.classList.remove('immerse-spinner-visible');
      this.dom.badgeDot.classList.remove('immerse-badge-dot-loading');
      this.dom.img.src = slide.url;
      this.dom.img.style.opacity = '1';
      this.dom.imgPrev.style.opacity = '0';
      this._updateBadgeText('HD Ready');
    };

    tempImg.src = slide.url;
  }

  _updateHeaderCounter() {
    const currentPostNum = this.currentPostIndex + 1;

    this._updateCounterText(`Photo ${currentPostNum}`);
    this.dom.prevPostBtn.disabled = this.currentPostIndex === 0;
    // Keep next button clickable so user can trigger load-more at the end
    this.dom.nextPostBtn.disabled = false;
  }

  _updateCarouselControls(post) {
    if (!post || post.slides.length <= 1) {
      this.dom.carouselCtrl.style.display = 'none';
      return;
    }

    this.dom.carouselCtrl.style.display = 'flex';
    const totalSlides = post.slides.length;
    const currentSlideNum = this.currentSlideIndex + 1;

    this.dom.carouselLabel.textContent = `Slide ${currentSlideNum} of ${totalSlides}`;
    this.dom.prevSlideBtn.disabled = this.currentSlideIndex === 0;
    this.dom.nextSlideBtn.disabled = this.currentSlideIndex === totalSlides - 1;

    // Render slide dots
    this.dom.dotsContainer.innerHTML = '';
    for (let i = 0; i < totalSlides; i++) {
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

    // Preload both previous and next slide of current post carousel
    const post = this.posts[this.currentPostIndex];
    if (post && post.slides) {
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
    this.resetTransform();
    if (this.currentPostIndex < this.posts.length - 1) {
      this.goToPost(this.currentPostIndex + 1, 0);
    } else if (this.onLoadMore) {
      this._updateCounterText(`Photo ${this.currentPostIndex + 1} • Loading...`);
      this._waitingForNextPost = true;
      this.onLoadMore();
    }
  }

  prevPost() {
    this._lastNavTime = Date.now();
    this._navDirection = -1;
    this.resetTransform();
    if (this.currentPostIndex > 0) {
      this.goToPost(this.currentPostIndex - 1, 0);
    }
  }

  goToPost(postIndex, slideIndex = 0) {
    this._lastNavTime = Date.now();
    this._navDirection = postIndex >= this.currentPostIndex ? 1 : -1;
    this.resetTransform();
    this.currentPostIndex = postIndex;
    this.currentSlideIndex = slideIndex;
    this.loadCurrent();
  }

  /* ---------------- Secondary Navigation: Carousel Slides ---------------- */

  nextSlide() {
    this._lastNavTime = Date.now();
    this._navDirection = 1;
    this.resetTransform();
    const post = this.posts[this.currentPostIndex];
    if (post && this.currentSlideIndex < post.slides.length - 1) {
      this.goToSlide(this.currentSlideIndex + 1);
    }
  }

  prevSlide() {
    this._lastNavTime = Date.now();
    this._navDirection = -1;
    this.resetTransform();
    if (this.currentSlideIndex > 0) {
      this.goToSlide(this.currentSlideIndex - 1);
    }
  }

  goToSlide(slideIndex) {
    this._lastNavTime = Date.now();
    this._navDirection = slideIndex >= this.currentSlideIndex ? 1 : -1;
    this.resetTransform();
    this.currentSlideIndex = slideIndex;
    this.loadCurrent();
  }

  /* ---------------- Zoom & Pan Transforms ---------------- */

  resetTransform() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this._applyTransform(true);
    if (this.dom?.imgPrev) {
      this.dom.imgPrev.style.transform = 'translate(0px, 0px) scale(1)';
    }
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

  toggleNativeFullscreen() {
    if (!document.fullscreenElement) {
      this.dom.root.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
}
