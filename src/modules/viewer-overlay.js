/**
 * viewer-overlay.js
 * Intuitive, high-performance fullscreen lightbox overlay with pan/zoom,
 * carousel navigation, resolution badge, and high-res download.
 */

import { createElement } from '../utils/dom-helpers.js';
import { getHighestResolutionUrl } from '../utils/srcset-parser.js';

export class ViewerOverlay {
  constructor(settings = {}) {
    this.settings = settings;
    this.isOpen = false;
    this.items = []; // Array of { url, width, height, originalElement }
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

    this.dom = null;
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleWheel = this._handleWheel.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);
    this._handleDblClick = this._handleDblClick.bind(this);
  }

  /**
   * Builds the DOM elements for the overlay if not already built.
   */
  _ensureDom() {
    if (this.dom) return;

    // Overlay Root
    const root = createElement('div', {
      className: 'immerse-overlay-root',
      attributes: { 'aria-modal': 'true', role: 'dialog' }
    });

    // Backdrop
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
      innerHTML: '<span class="immerse-badge-dot"></span><span class="immerse-badge-text">HD</span>'
    });

    // Carousel counter
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

    // Download button
    const downloadBtn = createElement('button', {
      className: 'immerse-btn',
      innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      attributes: { title: 'Download highest-resolution image (D)', 'aria-label': 'Download' },
      events: { click: () => this.downloadCurrent() }
    });

    // Close button
    const closeBtn = createElement('button', {
      className: 'immerse-btn immerse-btn-close',
      innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      attributes: { title: 'Close (Esc)', 'aria-label': 'Close' },
      events: { click: () => this.close() }
    });

    controls.append(zoomResetBtn, fullscreenBtn, downloadBtn, closeBtn);
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

    // Carousel Prev/Next Buttons
    const prevBtn = createElement('button', {
      className: 'immerse-nav-btn immerse-nav-prev',
      innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
      attributes: { 'aria-label': 'Previous image' },
      events: { click: (e) => { e.stopPropagation(); this.prev(); } }
    });

    const nextBtn = createElement('button', {
      className: 'immerse-nav-btn immerse-nav-next',
      innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
      attributes: { 'aria-label': 'Next image' },
      events: { click: (e) => { e.stopPropagation(); this.next(); } }
    });

    // Image container & element
    const imgWrapper = createElement('div', { className: 'immerse-image-wrapper' });
    const img = createElement('img', {
      className: 'immerse-image',
      attributes: { draggable: 'false' }
    });

    // Spinner
    const spinner = createElement('div', {
      className: 'immerse-spinner',
      innerHTML: '<div class="immerse-spinner-ring"></div>'
    });

    imgWrapper.append(img, spinner);
    stage.append(prevBtn, imgWrapper, nextBtn);
    root.append(backdrop, header, stage);

    this.dom = {
      root,
      backdrop,
      header,
      badge,
      badgeText: badge.querySelector('.immerse-badge-text'),
      counter,
      zoomResetBtn,
      fullscreenBtn,
      downloadBtn,
      closeBtn,
      stage,
      prevBtn,
      nextBtn,
      imgWrapper,
      img,
      spinner
    };

    document.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
  }

  /**
   * Opens the lightbox overlay with a set of image items.
   *
   * @param {Array<{url: string, width?: number, height?: number}>} items
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

    if (this._originalBodyOverflow !== undefined) {
      document.body.style.overflow = this._originalBodyOverflow;
    }

    this.isOpen = false;
    this.resetTransform();

    // Exit browser fullscreen if active
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
   * Loads the specified image index into the lightbox.
   *
   * @param {number} index
   */
  loadImage(index) {
    if (!this.items[index]) return;

    this.currentIndex = index;
    const item = this.items[index];

    this.resetTransform();
    this.dom.spinner.style.display = 'block';
    this.dom.img.style.opacity = '0';

    // Update Counter
    if (this.items.length > 1) {
      this.dom.counter.style.display = 'block';
      this.dom.counter.textContent = `${index + 1} / ${this.items.length}`;
      this.dom.prevBtn.style.display = 'flex';
      this.dom.nextBtn.style.display = 'flex';
      this.dom.prevBtn.disabled = index === 0;
      this.dom.nextBtn.disabled = index === this.items.length - 1;
    } else {
      this.dom.counter.style.display = 'none';
      this.dom.prevBtn.style.display = 'none';
      this.dom.nextBtn.style.display = 'none';
    }

    // Set badge to loading state
    this.dom.badgeText.textContent = 'Loading Ultra-HD...';

    const tempImg = new Image();
    tempImg.onload = () => {
      if (this.currentIndex !== index) return; // Prevent race conditions
      this.dom.img.src = item.url;
      this.dom.img.style.opacity = '1';
      this.dom.spinner.style.display = 'none';

      const w = tempImg.naturalWidth;
      const h = tempImg.naturalHeight;
      this.dom.badgeText.textContent = `${w} × ${h} • Highest Quality`;

      // Preload adjacent images
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

  _preloadAdjacent(currentIndex) {
    [-1, 1].forEach(offset => {
      const idx = currentIndex + offset;
      if (this.items[idx]) {
        const pre = new Image();
        pre.src = this.items[idx].url;
      }
    });
  }

  next() {
    if (this.currentIndex < this.items.length - 1) {
      this.loadImage(this.currentIndex + 1);
    }
  }

  prev() {
    if (this.currentIndex > 0) {
      this.loadImage(this.currentIndex - 1);
    }
  }

  /**
   * Resets pan and zoom transformations.
   */
  resetTransform() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this._applyTransform(true);
  }

  _applyTransform(smooth = false) {
    if (!this.dom?.img) return;

    if (smooth) {
      this.dom.img.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
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

  /**
   * Smooth mouse wheel zoom anchored to the cursor position.
   */
  _handleWheel(e) {
    if (!this.isOpen) return;
    e.preventDefault();

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * zoomFactor));

    if (newScale === this.scale) return;

    // Anchor zoom relative to stage center
    const rect = this.dom.stage.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    const ratio = newScale / this.scale;
    this.panX = mouseX - (mouseX - this.panX) * ratio;
    this.panY = mouseY - (mouseY - this.panY) * ratio;
    this.scale = newScale;

    // If scaled back to 1x or below, center image
    if (this.scale <= 1) {
      this.panX = 0;
      this.panY = 0;
    }

    this._applyTransform(false);
  }

  _handleMouseDown(e) {
    if (!this.isOpen || e.button !== 0) return;
    if (this.scale <= 1) return; // Only pan when zoomed in

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

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.prev();
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        this.toggleNativeFullscreen();
        break;
      case 'd':
      case 'D':
        e.preventDefault();
        this.downloadCurrent();
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

  toggleNativeFullscreen() {
    if (!document.fullscreenElement) {
      this.dom.root.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  downloadCurrent() {
    const item = this.items[this.currentIndex];
    if (!item?.url) return;

    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.download = `instagram-highres-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
