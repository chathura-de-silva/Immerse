/**
 * viewer-overlay.js
 * Intuitive, desktop-style fullscreen photo viewer with liquid-glass design language,
 * seamless grid navigation (arrow keys), pan/zoom, auto-hide controls, and copyright protection.
 */

import { createElement } from '../utils/dom-helpers.js';

export class ViewerOverlay {
  constructor(settings = {}) {
    this.settings = settings;
    this.isOpen = false;
    this.items = []; // Array of { id, url, width, height, postIndex, slideIndex, totalSlides, isCarousel }
    this.currentIndex = 0;

    // Pan & Zoom state
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.minScale = 0.5;
    this.maxScale = 6;

    // Idle auto-hide timer
    this._idleTimer = null;
    this.dom = null;

    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleWheel = this._handleWheel.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleDblClick = this._handleDblClick.bind(this);
    this._resetIdleTimer = this._resetIdleTimer.bind(this);
  }

  /**
   * Builds the DOM elements for the overlay with liquid-glass design language.
   */
  _ensureDom() {
    if (this.dom) return;

    // Overlay Root
    const root = createElement('div', {
      className: 'immerse-overlay-root',
      attributes: { 'aria-modal': 'true', role: 'dialog' }
    });

    // Backdrop with deep blur
    const backdrop = createElement('div', {
      className: 'immerse-backdrop',
      events: { click: (e) => {
        if (e.target === backdrop || e.target === stage) this.close();
      }}
    });

    // Header bar
    const header = createElement('div', { className: 'immerse-header' });

    // Resolution badge
    const badge = createElement('div', {
      className: 'immerse-badge',
      innerHTML: '<span class="immerse-badge-dot"></span><span class="immerse-badge-text">Ultra-HD</span>'
    });

    // Gallery counter pill
    const counter = createElement('div', {
      className: 'immerse-counter',
      textContent: '1 / 1'
    });

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

    // Navigation buttons (Previous / Next image in grid)
    const prevBtn = createElement('button', {
      className: 'immerse-nav-btn immerse-nav-prev',
      innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
      attributes: { 'aria-label': 'Previous image (Left Arrow)' },
      events: { click: (e) => { e.stopPropagation(); this.prev(); } }
    });

    const nextBtn = createElement('button', {
      className: 'immerse-nav-btn immerse-nav-next',
      innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
      attributes: { 'aria-label': 'Next image (Right Arrow)' },
      events: { click: (e) => { e.stopPropagation(); this.next(); } }
    });

    // Image container & protected element
    const imgWrapper = createElement('div', { className: 'immerse-image-wrapper' });
    const img = createElement('img', {
      className: 'immerse-image',
      attributes: { draggable: 'false' },
      style: { pointerEvents: 'none' }
    });

    // Protective transparent shield over image container
    const shield = createElement('div', {
      className: 'immerse-shield',
      attributes: { 'aria-hidden': 'true' }
    });

    // Shimmer spinner
    const spinner = createElement('div', {
      className: 'immerse-spinner',
      innerHTML: '<div class="immerse-spinner-ring"></div>'
    });

    imgWrapper.append(img, shield, spinner);
    stage.append(prevBtn, imgWrapper, nextBtn);
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
      badgeText: badge.querySelector('.immerse-badge-text'),
      counter,
      zoomResetBtn,
      fullscreenBtn,
      closeBtn,
      stage,
      prevBtn,
      nextBtn,
      imgWrapper,
      img,
      shield,
      spinner
    };

    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
    root.addEventListener('mousemove', this._resetIdleTimer);
  }

  /**
   * Opens the lightbox overlay with the complete gallery sequence.
   *
   * @param {Array<Object>} items Array of gallery items
   * @param {number} [startIndex=0]
   */
  open(items, startIndex = 0) {
    if (!items || items.length === 0) return;

    this._ensureDom();
    this.items = items;
    this.currentIndex = Math.max(0, Math.min(startIndex, items.length - 1));

    if (!document.body.contains(this.dom.root)) {
      document.body.appendChild(this.dom.root);
    }

    // Lock background scrolling
    this._originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Show root with fade-in animation
    requestAnimationFrame(() => {
      this.dom.root.classList.add('immerse-active');
      this._resetIdleTimer();
    });

    this.isOpen = true;
    document.addEventListener('keydown', this._handleKeyDown, true);

    this.loadImage(this.currentIndex);
  }

  /**
   * Closes and cleans up the lightbox overlay.
   */
  close() {
    if (!this.isOpen || !this.dom) return;

    this.dom.root.classList.remove('immerse-active');
    document.removeEventListener('keydown', this._handleKeyDown, true);

    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }

    if (this._originalBodyOverflow !== undefined) {
      document.body.style.overflow = this._originalBodyOverflow;
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
   * Updates the sequence items dynamically if new posts load into the grid.
   * @param {Array<Object>} newItems
   */
  updateSequence(newItems) {
    if (!newItems || newItems.length === 0) return;
    const oldLength = this.items.length;
    const currentItem = this.items[this.currentIndex];
    this.items = newItems;

    if (currentItem) {
      const newIdx = this.items.findIndex(it => it.id === currentItem.id || it.url === currentItem.url);
      if (newIdx !== -1) {
        this.currentIndex = newIdx;
      }
    }

    // Auto-advance if user was waiting at the boundary for new posts
    if (this._waitingForNextBatch && this.items.length > oldLength) {
      this._waitingForNextBatch = false;
      this.loadImage(oldLength);
    } else {
      this._updateCounter();
    }
  }

  /**
   * Loads the specified image index into the lightbox.
   *
   * @param {number} index
   */
  loadImage(index) {
    if (!this.items[index]) return;

    this.currentIndex = index;
    const item = this.items[index];

    // Proactively trigger background loading when nearing the end of the loaded sequence
    if (this.currentIndex >= this.items.length - 3 && this.onLoadMore) {
      this.onLoadMore();
    }

    this.resetTransform();
    this.dom.spinner.style.display = 'block';
    this.dom.img.style.opacity = '0';

    this._updateCounter();

    // Set badge to loading state
    this.dom.badgeText.textContent = 'Fetching Ultra-HD...';

    const tempImg = new Image();
    tempImg.onload = () => {
      if (this.currentIndex !== index) return;
      this.dom.img.src = item.url;
      this.dom.img.style.opacity = '1';
      this.dom.spinner.style.display = 'none';

      const w = tempImg.naturalWidth;
      const h = tempImg.naturalHeight;
      this.dom.badgeText.textContent = `${w} × ${h} • Highest Quality`;

      this._preloadAdjacent(index);
    };

    tempImg.onerror = () => {
      if (this.currentIndex !== index) return;
      this.dom.spinner.style.display = 'none';
      this.dom.badgeText.textContent = 'HD Ready';
      this.dom.img.src = item.url;
      this.dom.img.style.opacity = '1';
    };

    tempImg.src = item.url;
  }

  _updateCounter() {
    const total = this.items.length;
    const current = this.currentIndex + 1;
    const item = this.items[this.currentIndex];

    if (total > 1) {
      this.dom.counter.style.display = 'block';
      if (item && item.isCarousel && item.totalSlides > 1) {
        this.dom.counter.textContent = `${current} / ${total} • Slide ${item.slideIndex + 1}/${item.totalSlides}`;
      } else {
        this.dom.counter.textContent = `${current} / ${total}`;
      }

      this.dom.prevBtn.style.display = 'flex';
      this.dom.nextBtn.style.display = 'flex';
      this.dom.prevBtn.disabled = this.currentIndex === 0;
      // Never disable next if we can load more from feed
      this.dom.nextBtn.disabled = false;
    } else {
      this.dom.counter.style.display = 'none';
      this.dom.prevBtn.style.display = 'none';
      this.dom.nextBtn.style.display = 'none';
    }
  }

  _preloadAdjacent(currentIndex) {
    [-1, 1, 2].forEach(offset => {
      const idx = currentIndex + offset;
      if (this.items[idx]?.url) {
        const pre = new Image();
        pre.src = this.items[idx].url;
      }
    });
  }

  next() {
    // If approaching or at the end of loaded images, trigger background infinite load
    if (this.currentIndex >= this.items.length - 2 && this.onLoadMore) {
      this.onLoadMore();
    }

    if (this.currentIndex < this.items.length - 1) {
      this.loadImage(this.currentIndex + 1);
      this._resetIdleTimer();
    } else if (this.onLoadMore) {
      this.dom.counter.textContent = 'Loading next batch from feed...';
      this._waitingForNextBatch = true;
      this.onLoadMore();
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.loadImage(this.currentIndex - 1);
      this._resetIdleTimer();
    }
  }

  resetTransform() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this._applyTransform(true);
  }

  _applyTransform(smooth = false) {
    if (!this.dom?.img) return;

    if (smooth) {
      this.dom.img.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)';
    } else {
      this.dom.img.style.transition = 'none';
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
    this._resetIdleTimer();

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
    e.preventDefault();
    this._resetIdleTimer();

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
    this._resetIdleTimer();

    // Actively block save and copy shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
      case 'ArrowRight':
      case 'l':
      case 'L':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
      case 'j':
      case 'J':
        e.preventDefault();
        this.prev();
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
