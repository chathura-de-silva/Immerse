(() => {
  // src/modules/settings-store.js
  var DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    triggerMode: "both",
    // 'both' | 'button-only' | 'image-click'
    showResolutionBadge: true,
    wheelZoom: true,
    autoMaxRes: true
  });
  var SettingsStore = class {
    constructor() {
      this.cache = { ...DEFAULT_SETTINGS };
      this.listeners = /* @__PURE__ */ new Set();
      this.initialized = false;
    }
    /**
     * Initializes the settings store by loading values from storage and listening for changes.
     * @returns {Promise<typeof DEFAULT_SETTINGS>}
     */
    async init() {
      if (this.initialized) return this.cache;
      try {
        if (typeof chrome !== "undefined" && chrome.storage) {
          const storageArea = chrome.storage.sync || chrome.storage.local;
          const stored = await storageArea.get(DEFAULT_SETTINGS);
          this.cache = { ...DEFAULT_SETTINGS, ...stored };
          chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === "sync" || areaName === "local") {
              for (const [key, change] of Object.entries(changes)) {
                if (key in this.cache) {
                  this.cache[key] = change.newValue;
                }
              }
              this._notify(this.cache);
            }
          });
        }
      } catch (err) {
        console.warn("[Immerse] Failed to load settings from chrome.storage:", err);
      }
      this.initialized = true;
      return this.cache;
    }
    /**
     * Returns current settings.
     * @returns {typeof DEFAULT_SETTINGS}
     */
    get() {
      return { ...this.cache };
    }
    /**
     * Updates a specific setting.
     * @param {string} key
     * @param {*} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
      this.cache[key] = value;
      try {
        if (typeof chrome !== "undefined" && chrome.storage) {
          const storageArea = chrome.storage.sync || chrome.storage.local;
          await storageArea.set({ [key]: value });
        }
      } catch (err) {
        console.warn("[Immerse] Failed to save setting:", key, err);
      }
      this._notify(this.cache);
    }
    /**
     * Subscribes to settings updates.
     * @param {(settings: typeof DEFAULT_SETTINGS) => void} callback
     * @returns {() => void} Unsubscribe function
     */
    subscribe(callback) {
      this.listeners.add(callback);
      return () => this.listeners.delete(callback);
    }
    _notify(updatedSettings) {
      for (const listener of this.listeners) {
        try {
          listener(updatedSettings);
        } catch (e) {
          console.error("[Immerse] Error in settings listener:", e);
        }
      }
    }
  };
  var settingsStore = new SettingsStore();

  // src/utils/dom-helpers.js
  function createElement(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.textContent) el.textContent = options.textContent;
    if (options.innerHTML) el.innerHTML = options.innerHTML;
    if (options.attributes) {
      for (const [key, value] of Object.entries(options.attributes)) {
        el.setAttribute(key, value);
      }
    }
    if (options.dataset) {
      for (const [key, value] of Object.entries(options.dataset)) {
        el.dataset[key] = value;
      }
    }
    if (options.style) {
      Object.assign(el.style, options.style);
    }
    if (options.events) {
      for (const [evt, handler] of Object.entries(options.events)) {
        el.addEventListener(evt, handler);
      }
    }
    if (options.children && Array.isArray(options.children)) {
      for (const child of options.children) {
        if (child) el.appendChild(child);
      }
    }
    return el;
  }
  function findClosestPost(element) {
    if (!element) return null;
    return element.closest("article") || element.closest('div[role="dialog"]') || element.closest("div._aagv") || element.closest('a[href^="/p/"]') || element.closest('div[role="presentation"]') || element.parentElement;
  }
  function findPostImages(postContainer) {
    if (!postContainer) return [];
    const imgs = Array.from(postContainer.querySelectorAll("img[src], img[srcset]"));
    return imgs.filter((img) => {
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const isTiny = w > 0 && w < 120 || h > 0 && h < 120;
      const isAvatar = img.alt?.includes("profile picture") || img.closest("header") !== null;
      return !isTiny && !isAvatar;
    });
  }

  // src/modules/viewer-overlay.js
  var ViewerOverlay = class {
    constructor(settings = {}) {
      this.settings = settings;
      this.isOpen = false;
      this.items = [];
      this.currentIndex = 0;
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.minScale = 0.5;
      this.maxScale = 6;
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
      const root = createElement("div", {
        className: "immerse-overlay-root",
        attributes: { "aria-modal": "true", role: "dialog" }
      });
      const backdrop = createElement("div", {
        className: "immerse-backdrop",
        events: { click: (e) => {
          if (e.target === backdrop || e.target === stage) this.close();
        } }
      });
      const header = createElement("div", { className: "immerse-header" });
      const badge = createElement("div", {
        className: "immerse-badge",
        innerHTML: '<span class="immerse-badge-dot"></span><span class="immerse-badge-text">Ultra-HD</span>'
      });
      const counter = createElement("div", {
        className: "immerse-counter",
        textContent: "1 / 1"
      });
      const controls = createElement("div", { className: "immerse-controls" });
      const zoomResetBtn = createElement("button", {
        className: "immerse-btn immerse-btn-zoom",
        textContent: "100%",
        attributes: { title: "Reset zoom (0)", "aria-label": "Reset zoom" },
        events: { click: () => this.resetTransform() }
      });
      const fullscreenBtn = createElement("button", {
        className: "immerse-btn",
        innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
        attributes: { title: "Toggle Fullscreen (F)", "aria-label": "Toggle Fullscreen" },
        events: { click: () => this.toggleNativeFullscreen() }
      });
      const closeBtn = createElement("button", {
        className: "immerse-btn immerse-btn-close",
        innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        attributes: { title: "Close (Esc)", "aria-label": "Close" },
        events: { click: () => this.close() }
      });
      controls.append(zoomResetBtn, fullscreenBtn, closeBtn);
      header.append(badge, counter, controls);
      const stage = createElement("div", {
        className: "immerse-stage",
        events: {
          wheel: this._handleWheel,
          mousedown: this._handleMouseDown,
          dblclick: this._handleDblClick
        }
      });
      const prevBtn = createElement("button", {
        className: "immerse-nav-btn immerse-nav-prev",
        innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
        attributes: { "aria-label": "Previous image (Left Arrow)" },
        events: { click: (e) => {
          e.stopPropagation();
          this.prev();
        } }
      });
      const nextBtn = createElement("button", {
        className: "immerse-nav-btn immerse-nav-next",
        innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
        attributes: { "aria-label": "Next image (Right Arrow)" },
        events: { click: (e) => {
          e.stopPropagation();
          this.next();
        } }
      });
      const imgWrapper = createElement("div", { className: "immerse-image-wrapper" });
      const img = createElement("img", {
        className: "immerse-image",
        attributes: { draggable: "false" },
        style: { pointerEvents: "none" }
      });
      const shield = createElement("div", {
        className: "immerse-shield",
        attributes: { "aria-hidden": "true" }
      });
      const spinner = createElement("div", {
        className: "immerse-spinner",
        innerHTML: '<div class="immerse-spinner-ring"></div>'
      });
      imgWrapper.append(img, shield, spinner);
      stage.append(prevBtn, imgWrapper, nextBtn);
      root.append(backdrop, header, stage);
      root.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      root.addEventListener("dragstart", (e) => e.preventDefault());
      root.addEventListener("selectstart", (e) => e.preventDefault());
      this.dom = {
        root,
        backdrop,
        header,
        badge,
        badgeText: badge.querySelector(".immerse-badge-text"),
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
      document.addEventListener("mousemove", this._handleMouseMove);
      document.addEventListener("mouseup", this._handleMouseUp);
      root.addEventListener("mousemove", this._resetIdleTimer);
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
      this._originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        this.dom.root.classList.add("immerse-active");
        this._resetIdleTimer();
      });
      this.isOpen = true;
      document.addEventListener("keydown", this._handleKeyDown, true);
      this.loadImage(this.currentIndex);
    }
    /**
     * Closes and cleans up the lightbox overlay.
     */
    close() {
      if (!this.isOpen || !this.dom) return;
      this.dom.root.classList.remove("immerse-active");
      document.removeEventListener("keydown", this._handleKeyDown, true);
      if (this._idleTimer) {
        clearTimeout(this._idleTimer);
        this._idleTimer = null;
      }
      if (this._originalBodyOverflow !== void 0) {
        document.body.style.overflow = this._originalBodyOverflow;
      }
      this.isOpen = false;
      this.resetTransform();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
        });
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
      const currentItem = this.items[this.currentIndex];
      this.items = newItems;
      if (currentItem) {
        const newIdx = this.items.findIndex((it) => it.id === currentItem.id || it.url === currentItem.url);
        if (newIdx !== -1) {
          this.currentIndex = newIdx;
        }
      }
      this._updateCounter();
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
      this.dom.spinner.style.display = "block";
      this.dom.img.style.opacity = "0";
      this._updateCounter();
      this.dom.badgeText.textContent = "Fetching Ultra-HD...";
      const tempImg = new Image();
      tempImg.onload = () => {
        if (this.currentIndex !== index) return;
        this.dom.img.src = item.url;
        this.dom.img.style.opacity = "1";
        this.dom.spinner.style.display = "none";
        const w = tempImg.naturalWidth;
        const h = tempImg.naturalHeight;
        this.dom.badgeText.textContent = `${w} \xD7 ${h} \u2022 Highest Quality`;
        this._preloadAdjacent(index);
      };
      tempImg.onerror = () => {
        if (this.currentIndex !== index) return;
        this.dom.spinner.style.display = "none";
        this.dom.badgeText.textContent = "HD Ready";
        this.dom.img.src = item.url;
        this.dom.img.style.opacity = "1";
      };
      tempImg.src = item.url;
    }
    _updateCounter() {
      const total = this.items.length;
      const current = this.currentIndex + 1;
      const item = this.items[this.currentIndex];
      if (total > 1) {
        this.dom.counter.style.display = "block";
        if (item && item.isCarousel && item.totalSlides > 1) {
          this.dom.counter.textContent = `${current} / ${total} \u2022 Slide ${item.slideIndex + 1}/${item.totalSlides}`;
        } else {
          this.dom.counter.textContent = `${current} / ${total}`;
        }
        this.dom.prevBtn.style.display = "flex";
        this.dom.nextBtn.style.display = "flex";
        this.dom.prevBtn.disabled = this.currentIndex === 0;
        this.dom.nextBtn.disabled = this.currentIndex === total - 1;
      } else {
        this.dom.counter.style.display = "none";
        this.dom.prevBtn.style.display = "none";
        this.dom.nextBtn.style.display = "none";
      }
    }
    _preloadAdjacent(currentIndex) {
      [-1, 1, 2].forEach((offset) => {
        const idx = currentIndex + offset;
        if (this.items[idx]?.url) {
          const pre = new Image();
          pre.src = this.items[idx].url;
        }
      });
    }
    next() {
      if (this.currentIndex < this.items.length - 1) {
        this.loadImage(this.currentIndex + 1);
        this._resetIdleTimer();
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
        this.dom.img.style.transition = "transform 0.22s cubic-bezier(0.2, 0, 0, 1)";
      } else {
        this.dom.img.style.transition = "none";
      }
      this.dom.img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
      this.dom.zoomResetBtn.textContent = `${Math.round(this.scale * 100)}%`;
      if (this.scale > 1.05) {
        this.dom.stage.classList.add("immerse-can-pan");
      } else {
        this.dom.stage.classList.remove("immerse-can-pan", "immerse-is-panning");
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
      this.dom.stage.classList.add("immerse-is-panning");
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
        this.dom?.stage.classList.remove("immerse-is-panning");
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
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.key === "c" || e.key === "C")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          this.close();
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          this.next();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          this.prev();
          break;
        case "f":
        case "F":
          e.preventDefault();
          this.toggleNativeFullscreen();
          break;
        case "0":
          e.preventDefault();
          this.resetTransform();
          break;
        case "+":
        case "=":
          e.preventDefault();
          this.scale = Math.min(this.maxScale, this.scale * 1.25);
          this._applyTransform(true);
          break;
        case "-":
        case "_":
          e.preventDefault();
          this.scale = Math.max(this.minScale, this.scale / 1.25);
          if (this.scale <= 1) {
            this.panX = 0;
            this.panY = 0;
          }
          this._applyTransform(true);
          break;
      }
    }
    _resetIdleTimer() {
      if (!this.dom?.root) return;
      this.dom.root.classList.remove("immerse-controls-hidden");
      if (this._idleTimer) clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => {
        if (this.isOpen && !this.isDragging) {
          this.dom.root.classList.add("immerse-controls-hidden");
        }
      }, 3200);
    }
    toggleNativeFullscreen() {
      if (!document.fullscreenElement) {
        this.dom.root.requestFullscreen().catch(() => {
        });
      } else {
        document.exitFullscreen().catch(() => {
        });
      }
    }
  };

  // src/modules/hover-button.js
  var HoverButtonManager = class {
    /**
     * @param {Object} options
     * @param {(targetImg: HTMLImageElement, container: HTMLElement) => void} options.onTrigger
     * @param {() => Object} options.getSettings
     */
    constructor({ onTrigger, getSettings }) {
      this.onTrigger = onTrigger;
      this.getSettings = getSettings;
      this.attachedTiles = /* @__PURE__ */ new WeakSet();
    }
    /**
     * Attaches a hover trigger to an image or its parent tile in the grid or feed.
     *
     * @param {HTMLImageElement} imgElement
     * @param {HTMLElement} container
     */
    attach(imgElement, container) {
      if (!imgElement) return;
      const tile = imgElement.closest('a[href^="/p/"]') || imgElement.closest('a[href^="/reel/"]') || imgElement.closest("div._aabd") || imgElement.closest("article") || container || imgElement.parentElement;
      if (!tile || this.attachedTiles.has(tile)) return;
      this.attachedTiles.add(tile);
      const tileStyle = window.getComputedStyle(tile);
      if (tileStyle.position === "static") {
        tile.style.position = "relative";
      }
      const btnContainer = createElement("div", {
        className: "immerse-hover-btn-container"
      });
      const btn = createElement("button", {
        className: "immerse-hover-btn",
        attributes: {
          type: "button",
          title: "View in Ultra-HD Fullscreen (Immerse)",
          "aria-label": "View in Ultra-HD Fullscreen"
        },
        innerHTML: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>HD</span>
      `
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.onTrigger(imgElement, tile);
      });
      btnContainer.appendChild(btn);
      let hideTimer = null;
      const showBtn = () => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        const settings = this.getSettings ? this.getSettings() : { enabled: true };
        if (settings.enabled !== false) {
          btn.classList.add("immerse-visible");
        }
      };
      const hideBtn = () => {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          btn.classList.remove("immerse-visible");
        }, 120);
      };
      tile.addEventListener("mouseenter", showBtn, { passive: true });
      tile.addEventListener("mousemove", showBtn, { passive: true });
      tile.addEventListener("mouseleave", hideBtn, { passive: true });
      imgElement.addEventListener("click", (e) => {
        const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: "both" };
        if (!settings.enabled) return;
        if (settings.triggerMode === "image-click" || settings.triggerMode === "both") {
          e.preventDefault();
          e.stopPropagation();
          this.onTrigger(imgElement, tile);
        }
      }, true);
      tile.appendChild(btnContainer);
    }
  };

  // src/utils/srcset-parser.js
  function parseSrcset(srcset) {
    if (!srcset || typeof srcset !== "string") {
      return [];
    }
    const trimmed = srcset.trim();
    if (!trimmed) {
      return [];
    }
    const candidateRegex = /(?:^|,)\s*([^\s]+)\s*(?:([0-9.]+)w|([0-9.]+)x)?/g;
    const candidates = [];
    let match;
    while ((match = candidateRegex.exec(trimmed)) !== null) {
      const rawUrl = match[1];
      if (!rawUrl) continue;
      const widthDesc = match[2] ? parseFloat(match[2]) : 0;
      const densityDesc = match[3] ? parseFloat(match[3]) : 0;
      let effectiveWidth = widthDesc;
      if (!effectiveWidth && densityDesc) {
        effectiveWidth = Math.round(densityDesc * 640);
      }
      if (!effectiveWidth) {
        effectiveWidth = extractWidthFromUrl(rawUrl);
      }
      candidates.push({
        url: rawUrl,
        width: effectiveWidth,
        density: densityDesc || 1
      });
    }
    candidates.sort((a, b) => b.width - a.width);
    return candidates;
  }
  function extractWidthFromUrl(url) {
    if (!url || typeof url !== "string") return 0;
    const match = url.match(/[sp]?(\d{3,4})x(\d{3,4})/i) || url.match(/c\d+\.\d+\.(\d{3,4})\.(\d{3,4})/i) || url.match(/[_\-/](\d{3,4})w/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  }
  function upgradeCdnUrl(url) {
    if (!url || typeof url !== "string") return url;
    return url.replace(/([sp])(150|240|320|480|640|750)x\2/g, "$11080x1080");
  }
  function extractFromReactFiber(element) {
    if (!element || typeof element !== "object") return null;
    let curr = element;
    for (let depth = 0; depth < 5 && curr; depth++) {
      const propsKey = Object.keys(curr).find((k) => k.startsWith("__reactProps$"));
      if (propsKey && curr[propsKey]) {
        const match = searchMediaProps(curr[propsKey], 0);
        if (match) return match;
      }
      const fiberKey = Object.keys(curr).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
      if (fiberKey && curr[fiberKey]) {
        let fiber = curr[fiberKey];
        for (let fDepth = 0; fDepth < 8 && fiber; fDepth++) {
          const match = searchMediaProps(fiber.memoizedProps, 0) || searchMediaProps(fiber.pendingProps, 0);
          if (match) return match;
          fiber = fiber.return;
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }
  function searchMediaProps(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 4) return null;
    if (obj.image_versions2?.candidates && Array.isArray(obj.image_versions2.candidates)) {
      const sorted = [...obj.image_versions2.candidates].sort((a, b) => (b.width || 0) - (a.width || 0));
      if (sorted[0]?.url) {
        return {
          url: sorted[0].url,
          width: sorted[0].width || 1080,
          height: sorted[0].height || 1080
        };
      }
    }
    if (obj.display_resources && Array.isArray(obj.display_resources)) {
      const sorted = [...obj.display_resources].sort((a, b) => (b.config_width || 0) - (a.config_width || 0));
      if (sorted[0]?.src) {
        return {
          url: sorted[0].src,
          width: sorted[0].config_width || 1080,
          height: sorted[0].config_height || 1080
        };
      }
    }
    if (typeof obj.display_url === "string" && obj.display_url.startsWith("http")) {
      return {
        url: obj.display_url,
        width: obj.dimensions?.width || 1080,
        height: obj.dimensions?.height || 1080
      };
    }
    const interestingKeys = ["post", "media", "item", "carousel_media", "node"];
    for (const key of interestingKeys) {
      if (obj[key]) {
        const match = searchMediaProps(obj[key], depth + 1);
        if (match) return match;
      }
    }
    return null;
  }
  function getHighestResolutionUrl(imgElement) {
    if (!imgElement) return "";
    try {
      const fiberCandidate = extractFromReactFiber(imgElement);
      if (fiberCandidate?.url) {
        return fiberCandidate.url;
      }
    } catch {
    }
    const srcset = (typeof imgElement.getAttribute === "function" ? imgElement.getAttribute("srcset") : imgElement.srcset) || "";
    const candidates = parseSrcset(srcset);
    if (candidates.length > 0 && candidates[0].url) {
      if (candidates[0].width >= 1080) {
        return candidates[0].url;
      }
      return upgradeCdnUrl(candidates[0].url);
    }
    const fallbackUrl = imgElement.currentSrc || imgElement.src || "";
    return upgradeCdnUrl(fallbackUrl);
  }

  // src/modules/media-detector.js
  var MediaDetector = class {
    /**
     * @param {Object} options
     * @param {(img: HTMLImageElement, container: HTMLElement) => void} options.onMediaFound
     */
    constructor({ onMediaFound }) {
      this.onMediaFound = onMediaFound;
      this.processedImages = /* @__PURE__ */ new WeakSet();
      this.mediaEntries = [];
      this.observer = null;
      this._rafScheduled = false;
      this._pendingNodes = [];
    }
    /**
     * Starts observing the DOM for media elements.
     */
    start() {
      this.scan(document.body);
      this.observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              const node = mutation.addedNodes[i];
              if (node.nodeType === Node.ELEMENT_NODE) {
                this._pendingNodes.push(node);
                shouldScan = true;
              }
            }
          }
        }
        if (shouldScan && !this._rafScheduled) {
          this._rafScheduled = true;
          requestAnimationFrame(() => {
            this._processPendingNodes();
            this._rafScheduled = false;
          });
        }
      });
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    /**
     * Stops the mutation observer.
     */
    stop() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      this._pendingNodes = [];
    }
    _processPendingNodes() {
      const nodes = this._pendingNodes.splice(0, this._pendingNodes.length);
      for (const node of nodes) {
        this.scan(node);
      }
    }
    /**
     * Scans a root element for Instagram images.
     *
     * @param {HTMLElement} root
     */
    scan(root) {
      if (!root || !root.querySelectorAll) return;
      const selector = 'article img, div._aagv img, a[href^="/p/"] img, a[href^="/reel/"] img, div[role="dialog"] img';
      const images = Array.from(root.querySelectorAll(selector));
      if (root.tagName === "IMG" && root.matches(selector)) {
        images.push(root);
      }
      for (const img of images) {
        if (this.processedImages.has(img)) continue;
        const isAvatar = img.alt?.toLowerCase().includes("profile picture") || img.closest("header") !== null || img.width < 120 && img.width > 0;
        if (isAvatar) continue;
        this.processedImages.add(img);
        const container = img.closest('a[href^="/p/"]') || img.closest('a[href^="/reel/"]') || img.closest("div._aagv") || img.closest("article") || img.parentElement;
        if (container) {
          this.mediaEntries.push({ img, container });
          this.onMediaFound(img, container);
        }
      }
    }
    /**
     * Returns all currently detected media entries that are connected to the DOM.
     * @returns {Array<{img: HTMLImageElement, container: HTMLElement}>}
     */
    getMediaEntries() {
      this.mediaEntries = this.mediaEntries.filter((e) => e.img && document.body.contains(e.img));
      return this.mediaEntries;
    }
    /**
     * Resolves all media items in the same post or carousel for the given image.
     *
     * @param {HTMLImageElement} img
     * @param {HTMLElement} [container]
     * @returns {Array<{url: string, width?: number, height?: number}>}
     */
    resolvePostMediaItems(img, container) {
      const postContainer = findClosestPost(container || img);
      if (!postContainer) {
        return [{ url: getHighestResolutionUrl(img), originalElement: img }];
      }
      const postImages = findPostImages(postContainer);
      if (postImages.length <= 1) {
        return [{ url: getHighestResolutionUrl(img), originalElement: img }];
      }
      const items = [];
      const seenUrls = /* @__PURE__ */ new Set();
      for (const imageEl of postImages) {
        const url = getHighestResolutionUrl(imageEl);
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({
            url,
            width: imageEl.naturalWidth || 1080,
            height: imageEl.naturalHeight || 1080,
            originalElement: imageEl
          });
        }
      }
      return items.length > 0 ? items : [{ url: getHighestResolutionUrl(img), originalElement: img }];
    }
  };

  // src/modules/gallery-sequencer.js
  var GallerySequencer = class {
    constructor() {
      this.items = [];
      this.knownImgSet = /* @__PURE__ */ new WeakSet();
      this.listeners = /* @__PURE__ */ new Set();
    }
    /**
     * Rebuilds and synchronizes the sequence of all discoverable media on the page
     * sorted in visual reading order (top-to-bottom, left-to-right).
     *
     * @param {HTMLElement[]} rootElements
     * @returns {Array<Object>}
     */
    syncSequence(mediaEntries) {
      if (!mediaEntries || mediaEntries.length === 0) return this.items;
      const validEntries = mediaEntries.filter((entry) => entry.img && document.body.contains(entry.img));
      validEntries.sort((a, b) => {
        const rectA = (a.container || a.img).getBoundingClientRect();
        const rectB = (b.container || b.img).getBoundingClientRect();
        const topDiff = rectA.top + window.scrollY - (rectB.top + window.scrollY);
        if (Math.abs(topDiff) > 20) {
          return topDiff;
        }
        return rectA.left + window.scrollX - (rectB.left + window.scrollX);
      });
      const newSequence = [];
      const seenUrls = /* @__PURE__ */ new Set();
      validEntries.forEach((entry, postIndex) => {
        const { img, container } = entry;
        const post = findClosestPost(container || img);
        const postImages = post ? findPostImages(post) : [img];
        if (postImages.length > 1) {
          postImages.forEach((slideImg, slideIndex) => {
            const url = getHighestResolutionUrl(slideImg);
            if (url && !seenUrls.has(url)) {
              seenUrls.add(url);
              newSequence.push({
                id: `${postIndex}-${slideIndex}-${url.slice(-16)}`,
                img: slideImg,
                container: container || post,
                post,
                url,
                width: slideImg.naturalWidth || 1080,
                height: slideImg.naturalHeight || 1080,
                postIndex,
                slideIndex,
                totalSlides: postImages.length,
                isCarousel: true
              });
            }
          });
        } else {
          const url = getHighestResolutionUrl(img);
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            newSequence.push({
              id: `${postIndex}-0-${url.slice(-16)}`,
              img,
              container: container || post,
              post,
              url,
              width: img.naturalWidth || 1080,
              height: img.naturalHeight || 1080,
              postIndex,
              slideIndex: 0,
              totalSlides: 1,
              isCarousel: false
            });
          }
        }
      });
      this.items = newSequence;
      this._notify();
      return this.items;
    }
    /**
     * Finds the sequential index corresponding to a specific image element or URL.
     *
     * @param {HTMLImageElement} targetImg
     * @returns {number} Index, or 0 if not found
     */
    findIndex(targetImg) {
      if (!targetImg || this.items.length === 0) return 0;
      const targetSrc = targetImg.currentSrc || targetImg.src || "";
      const index = this.items.findIndex((item) => {
        if (item.img === targetImg) return true;
        if (targetSrc && item.url.includes(targetSrc)) return true;
        return false;
      });
      return index !== -1 ? index : 0;
    }
    /**
     * Returns item at index.
     * @param {number} index
     * @returns {Object|null}
     */
    getItem(index) {
      return this.items[index] || null;
    }
    /**
     * Total number of items in sequence.
     * @returns {number}
     */
    get length() {
      return this.items.length;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    _notify() {
      for (const listener of this.listeners) {
        try {
          listener(this.items);
        } catch (e) {
          console.error("[GallerySequencer] Error in listener:", e);
        }
      }
    }
  };

  // src/content.js
  var ImmerseApp = class {
    constructor() {
      this.overlay = null;
      this.hoverButtons = null;
      this.mediaDetector = null;
      this.sequencer = null;
      this.initialized = false;
    }
    async init() {
      if (this.initialized) return;
      const settings = await settingsStore.init();
      this.sequencer = new GallerySequencer();
      this.overlay = new ViewerOverlay(settings);
      this.hoverButtons = new HoverButtonManager({
        onTrigger: (img, container) => this.handleTrigger(img, container),
        getSettings: () => settingsStore.get()
      });
      this.mediaDetector = new MediaDetector({
        onMediaFound: (img, container) => {
          const currentSettings = settingsStore.get();
          if (currentSettings.enabled) {
            this.hoverButtons.attach(img, container);
            if (this.overlay?.isOpen) {
              const updatedItems = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());
              this.overlay.updateSequence(updatedItems);
            }
          }
        }
      });
      settingsStore.subscribe((newSettings) => {
        this.handleSettingsChange(newSettings);
      });
      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.type === "GET_STATUS") {
            sendResponse({
              active: true,
              settings: settingsStore.get(),
              overlayOpen: this.overlay?.isOpen || false,
              totalItems: this.sequencer?.length || 0
            });
          } else if (message.type === "SETTINGS_CHANGED") {
            this.handleSettingsChange(message.settings);
            sendResponse({ success: true });
          }
          return true;
        });
      }
      if (settings.enabled) {
        this.mediaDetector.start();
      }
      this.initialized = true;
      console.log("[Immerse] Instagram High-Resolution Extension loaded with Liquid Glass UI.");
    }
    /**
     * Handles opening the fullscreen overlay with the complete page sequence.
     *
     * @param {HTMLImageElement} targetImg
     * @param {HTMLElement} container
     */
    handleTrigger(targetImg, container) {
      const settings = settingsStore.get();
      if (!settings.enabled) return;
      const sequenceItems = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());
      if (sequenceItems.length > 0) {
        const initialIndex = this.sequencer.findIndex(targetImg);
        this.overlay.open(sequenceItems, initialIndex);
      } else {
        const items = this.mediaDetector.resolvePostMediaItems(targetImg, container);
        this.overlay.open(items, 0);
      }
    }
    handleSettingsChange(newSettings) {
      if (newSettings.enabled) {
        this.mediaDetector.start();
      } else {
        this.mediaDetector.stop();
        if (this.overlay?.isOpen) {
          this.overlay.close();
        }
      }
    }
  };
  var app = new ImmerseApp();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
  } else {
    app.init();
  }
})();
