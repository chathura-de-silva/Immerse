(() => {
  // src/modules/settings-store.js
  var DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    triggerMode: "both",
    // 'both' | 'button-only' | 'image-click'
    showResolutionBadge: true,
    wheelZoom: true,
    transitionStyle: "parallax",
    // 'parallax' | 'slide'
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
  function isLegitimatePostImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    const src = img.currentSrc || img.src || "";
    if (!src) return false;
    if (!src.includes("cdninstagram") && !src.includes("fbcdn") && !src.includes("instagram")) {
      return false;
    }
    const alt = (img.alt || "").toLowerCase();
    if (alt.includes("profile picture") || alt.includes("avatar") || alt.includes("story")) {
      return false;
    }
    if (img.closest('header, nav, aside, div[role="tooltip"], div[role="menu"]')) {
      return false;
    }
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (w > 0 && w < 160 || h > 0 && h < 160) {
      return false;
    }
    if (img.closest('a[href*="/reel"]')) {
      return false;
    }
    const postLink = img.closest('a[href*="/p/"], article');
    if (!postLink) {
      return false;
    }
    if (postLink.matches('a[href*="/reel"]') || postLink.querySelector('a[href*="/reel"]')) {
      return false;
    }
    return true;
  }
  function findClosestPost(element) {
    if (!element) return null;
    if (element.closest('a[href*="/reel"]')) return null;
    return element.closest('a[href*="/p/"]') || element.closest("article") || element.closest('div[role="dialog"] a[href*="/p/"]');
  }
  function findPostImages(postContainer) {
    if (!postContainer) return [];
    const imgs = Array.from(postContainer.querySelectorAll("img[src], img[srcset]"));
    return imgs.filter(isLegitimatePostImage);
  }
  function findPostMediaContainer(element) {
    if (!element) return document.body;
    const postLink = element.closest('a[href*="/p/"]');
    if (postLink) return postLink;
    const article = element.closest("article");
    if (article) {
      let curr = element;
      while (curr && curr.parentElement && curr.parentElement !== article && curr.parentElement !== document.body) {
        curr = curr.parentElement;
      }
      if (curr && curr.parentElement === article) {
        return curr;
      }
    }
    return element.parentElement || element;
  }
  function findNativeCarouselNextButton(postContainer) {
    if (!postContainer) return null;
    const labelMatches = postContainer.querySelectorAll(
      'button[aria-label*="Next" i], button[aria-label*="next" i], button[aria-label*="Suivant" i], button[aria-label*="Weiter" i], button[aria-label*="Siguiente" i], button[aria-label*="Avanti" i], button[aria-label*="Pr\xF3ximo" i], div[role="button"][aria-label*="Next" i]'
    );
    if (labelMatches.length > 0) {
      return labelMatches[labelMatches.length - 1];
    }
    const buttons = Array.from(postContainer.querySelectorAll('button, div[role="button"]'));
    for (const btn of buttons) {
      if (btn.closest("header, section, form")) continue;
      const svg = btn.querySelector("svg");
      if (!svg) continue;
      const svgLabel = (svg.getAttribute("aria-label") || "").toLowerCase();
      if (svgLabel.includes("next") || svgLabel.includes("chevron")) {
        return btn;
      }
      const polyline = svg.querySelector("polyline");
      if (polyline) {
        const rect = btn.getBoundingClientRect();
        const postRect = postContainer.getBoundingClientRect();
        if (rect.left > postRect.left + postRect.width * 0.5) {
          return btn;
        }
      }
    }
    return null;
  }
  function findNativeCarouselPrevButton(postContainer) {
    if (!postContainer) return null;
    const labelMatches = postContainer.querySelectorAll(
      'button[aria-label*="Previous" i], button[aria-label*="prev" i], button[aria-label*="Pr\xE9c\xE9dent" i], button[aria-label*="Zur\xFCck" i], button[aria-label*="Anterior" i], button[aria-label*="Precedente" i], div[role="button"][aria-label*="Previous" i]'
    );
    if (labelMatches.length > 0) {
      return labelMatches[0];
    }
    const buttons = Array.from(postContainer.querySelectorAll('button, div[role="button"]'));
    for (const btn of buttons) {
      if (btn.closest("header, section, form")) continue;
      const svg = btn.querySelector("svg");
      if (!svg) continue;
      const svgLabel = (svg.getAttribute("aria-label") || "").toLowerCase();
      if (svgLabel.includes("prev") || svgLabel.includes("back")) {
        return btn;
      }
      const polyline = svg.querySelector("polyline");
      if (polyline) {
        const rect = btn.getBoundingClientRect();
        const postRect = postContainer.getBoundingClientRect();
        if (rect.left < postRect.left + postRect.width * 0.5) {
          return btn;
        }
      }
    }
    return null;
  }
  function isCarouselPost(postContainer) {
    if (!postContainer) return false;
    const imgs = findPostImages(postContainer);
    if (imgs.length > 1) return true;
    if (findNativeCarouselNextButton(postContainer) || findNativeCarouselPrevButton(postContainer)) {
      return true;
    }
    if (postContainer.querySelector('svg[aria-label*="Carousel" i], svg[aria-label*="carousel" i]')) {
      return true;
    }
    const text = postContainer.innerText || postContainer.textContent || "";
    if (/\b\d+\s*[/of]\s*\d+\b/i.test(text.slice(0, 300))) {
      return true;
    }
    return false;
  }
  function getEstimatedSlideCount(postContainer) {
    if (!postContainer) return 1;
    const text = postContainer.innerText || postContainer.textContent || "";
    const match = text.slice(0, 300).match(/\b\d+\s*[/of]\s*(\d+)\b/i);
    if (match) {
      const total = parseInt(match[1], 10);
      if (total >= 2 && total <= 20) return total;
    }
    const allDivs = Array.from(postContainer.querySelectorAll("div"));
    for (const div of allDivs) {
      const children = Array.from(div.children);
      if (children.length >= 2 && children.length <= 15) {
        const firstChild = children[0];
        const style = window.getComputedStyle(firstChild);
        const w = parseFloat(style.width);
        const h = parseFloat(style.height);
        if (w > 0 && w <= 16 && h > 0 && h <= 16) {
          return children.length;
        }
      }
    }
    const imgs = findPostImages(postContainer);
    return Math.max(1, imgs.length);
  }

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
  function getResolutionCandidates(imgElement) {
    if (!imgElement) return [];
    const candidates = [];
    const seenUrls = /* @__PURE__ */ new Set();
    try {
      const fiberCandidate = extractFromReactFiber(imgElement);
      if (fiberCandidate?.url && !seenUrls.has(fiberCandidate.url)) {
        seenUrls.add(fiberCandidate.url);
        candidates.push({
          url: fiberCandidate.url,
          width: fiberCandidate.width || 1080
        });
      }
    } catch {
    }
    const srcset = (typeof imgElement.getAttribute === "function" ? imgElement.getAttribute("srcset") : imgElement.srcset) || "";
    const parsed = parseSrcset(srcset);
    for (const item of parsed) {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        candidates.push({
          url: item.url,
          width: item.width || 640
        });
      }
    }
    const fallbackUrl = imgElement.currentSrc || imgElement.src || "";
    if (fallbackUrl && !seenUrls.has(fallbackUrl)) {
      seenUrls.add(fallbackUrl);
      candidates.push({
        url: fallbackUrl,
        width: extractWidthFromUrl(fallbackUrl) || 640
      });
    }
    candidates.sort((a, b) => b.width - a.width);
    return candidates;
  }
  function getHighestResolutionUrl(imgElement) {
    const candidates = getResolutionCandidates(imgElement);
    return candidates.length > 0 ? candidates[0].url : imgElement?.currentSrc || imgElement?.src || "";
  }

  // src/modules/viewer-overlay.js
  var ViewerOverlay = class {
    constructor(options = {}) {
      this.options = options;
      this.onLoadMore = options.onLoadMore || null;
      this.isOpen = false;
      this.posts = [];
      this.currentPostIndex = 0;
      this.currentSlideIndex = 0;
      this._waitingForNextPost = false;
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.minScale = 0.5;
      this.maxScale = 6;
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
      const badgeDot = createElement("span", { className: "immerse-badge-dot" });
      const badgeText = createElement("span", {
        className: "immerse-badge-text",
        textContent: "Ultra-HD"
      });
      const showBadge = this.options.showResolutionBadge !== false;
      const badge = createElement("div", {
        className: "immerse-badge",
        style: { display: showBadge ? "inline-flex" : "none" }
      });
      badge.append(badgeDot, badgeText);
      const counterText = createElement("span", {
        className: "immerse-counter-text",
        textContent: "Photo 1"
      });
      const counter = createElement("div", { className: "immerse-counter" });
      counter.append(counterText);
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
      const prevPostBtn = createElement("button", {
        className: "immerse-nav-btn immerse-nav-prev",
        innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
        attributes: { title: "Previous Post (Left Arrow)", "aria-label": "Previous Post" },
        events: {
          click: (e) => {
            e.stopPropagation();
            this.prevPost();
          },
          dblclick: (e) => {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      });
      const nextPostBtn = createElement("button", {
        className: "immerse-nav-btn immerse-nav-next",
        innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
        attributes: { title: "Next Post (Right Arrow)", "aria-label": "Next Post" },
        events: {
          click: (e) => {
            e.stopPropagation();
            this.nextPost();
          },
          dblclick: (e) => {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      });
      const imgWrapper = createElement("div", { className: "immerse-image-wrapper" });
      const imgPrev = createElement("img", {
        className: "immerse-image immerse-image-prev",
        attributes: { draggable: "false" },
        style: { opacity: "0", display: "none", pointerEvents: "none" }
      });
      const img = createElement("img", {
        className: "immerse-image immerse-image-curr",
        attributes: { draggable: "false" },
        style: { opacity: "0", pointerEvents: "none" }
      });
      const shield = createElement("div", {
        className: "immerse-shield",
        attributes: { "aria-hidden": "true" }
      });
      const spinner = createElement("div", {
        className: "immerse-spinner",
        innerHTML: '<div class="immerse-spinner-ring"></div>'
      });
      imgWrapper.append(imgPrev, img, shield, spinner);
      const carouselCtrl = createElement("div", {
        className: "immerse-carousel-controller",
        style: { display: "none" }
      });
      const prevSlideBtn = createElement("button", {
        className: "immerse-carousel-btn",
        innerHTML: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
        attributes: { title: "Previous Slide (Up Arrow)", "aria-label": "Previous Slide" },
        events: {
          click: (e) => {
            e.stopPropagation();
            this.prevSlide();
          },
          dblclick: (e) => {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      });
      const dotsContainer = createElement("div", { className: "immerse-dots" });
      const nextSlideBtn = createElement("button", {
        className: "immerse-carousel-btn",
        innerHTML: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
        attributes: { title: "Next Slide (Down Arrow)", "aria-label": "Next Slide" },
        events: {
          click: (e) => {
            e.stopPropagation();
            this.nextSlide();
          },
          dblclick: (e) => {
            e.stopPropagation();
            e.preventDefault();
          }
        }
      });
      const carouselLabel = createElement("span", {
        className: "immerse-carousel-label",
        textContent: "Slide 1/1"
      });
      carouselCtrl.append(prevSlideBtn, dotsContainer, carouselLabel, nextSlideBtn);
      stage.append(prevPostBtn, imgWrapper, nextPostBtn, carouselCtrl);
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
      document.addEventListener("mousemove", this._handleMouseMove);
      document.addEventListener("mouseup", this._handleMouseUp);
      root.addEventListener("mousemove", this._handleRootMouseMove);
      root.addEventListener("pointerdown", this._handleRootPointerDown);
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
        this.dom.root.classList.add("immerse-active");
        this._resetIdleTimer();
        this._wakeCursor();
      });
      this.isOpen = true;
      document.addEventListener("keydown", this._handleKeyDown, true);
      this.loadCurrent();
    }
    /**
     * Closes the lightbox overlay.
     */
    close() {
      if (!this.isOpen || !this.dom) return;
      this.dom.root.classList.remove("immerse-active");
      this.dom.root.classList.remove("immerse-controls-hidden");
      this.dom.root.classList.remove("immerse-cursor-hidden");
      document.removeEventListener("keydown", this._handleKeyDown, true);
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
     * Updates posts dynamically when Instagram loads more items in the background.
     *
     * @param {Array<Object>} newPosts
     */
    updatePosts(newPosts) {
      if (!newPosts || newPosts.length === 0) return;
      const oldLength = this.posts.length;
      const activePost = this.posts[this.currentPostIndex];
      if (activePost) {
        const newActiveIdx = newPosts.findIndex((p) => p.id === activePost.id || p.tile && p.tile === activePost.tile);
        if (newActiveIdx !== -1) {
          this.currentPostIndex = newActiveIdx;
        }
      }
      this.posts = newPosts;
      if (this._waitingForNextPost && this.posts.length > oldLength) {
        this._waitingForNextPost = false;
        this.goToPost(oldLength, 0);
      } else {
        this._updateHeaderCounter();
        const curr = this.posts[this.currentPostIndex];
        if (curr) {
          this._updateCarouselControls(curr);
        }
      }
    }
    /**
     * Synchronizes and accumulates any newly mounted slides for the given post.
     *
     * @param {Object} post
     */
    _syncPostSlides(post) {
      if (!post || !post.tile) return;
      const postImages = findPostImages(post.tile);
      const seenUrls = new Set(post.slides.map((s) => s.url));
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
      if (this.dom?.badge) {
        const showBadge = this.options.showResolutionBadge !== false;
        this.dom.badge.style.display = showBadge ? "inline-flex" : "none";
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
      this.dom.badgeText.classList.add("immerse-text-fading");
      this._badgeTextTimeout = setTimeout(() => {
        if (this.dom?.badgeText) {
          this.dom.badgeText.textContent = text;
          this.dom.badgeText.classList.remove("immerse-text-fading");
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
      this.dom.counterText.classList.add("immerse-text-fading");
      this._counterTextTimeout = setTimeout(() => {
        if (this.dom?.counterText) {
          this.dom.counterText.textContent = text;
          this.dom.counterText.classList.remove("immerse-text-fading");
        }
      }, 120);
    }
    /**
     * Loads the current post and current slide into view with seamless GPU-accelerated crossfading.
     */
    loadCurrent() {
      const post = this.posts[this.currentPostIndex];
      if (!post || !post.slides || post.slides.length === 0) return;
      if (this._transitionTimeout) {
        clearTimeout(this._transitionTimeout);
        this._transitionTimeout = null;
      }
      if (this._spinnerTimeout) {
        clearTimeout(this._spinnerTimeout);
        this._spinnerTimeout = null;
      }
      this._syncPostSlides(post);
      this.currentSlideIndex = Math.max(0, Math.min(this.currentSlideIndex, post.slides.length - 1));
      const slide = post.slides[this.currentSlideIndex];
      if (this.currentPostIndex >= this.posts.length - 3 && this.onLoadMore) {
        this.onLoadMore();
      }
      this.resetZoomState();
      this._updateHeaderCounter();
      this._updateCarouselControls(post);
      if (this.dom.img.src === slide.url && this.dom.img.style.opacity === "1") {
        this._preloadAdjacent();
        return;
      }
      const targetPostIndex = this.currentPostIndex;
      const targetSlideIndex = this.currentSlideIndex;
      if (this.dom.img.src && this.dom.img.style.display !== "none" && this.dom.img.style.opacity !== "0") {
        this.dom.imgPrev.src = this.dom.img.src;
        this.dom.imgPrev.style.display = "block";
        this.dom.imgPrev.style.opacity = "1";
        this.dom.imgPrev.style.transform = "translate3d(0, 0, 0) scale(1)";
        this.dom.imgPrev.style.transition = "none";
      } else if (this.dom.imgPrev.src) {
        this.dom.imgPrev.style.display = "block";
        this.dom.imgPrev.style.opacity = "1";
      }
      this.dom.img.style.opacity = "0";
      if (this._spinnerTimeout) clearTimeout(this._spinnerTimeout);
      this._spinnerTimeout = setTimeout(() => {
        if (this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
          this.dom.spinner.classList.add("immerse-spinner-visible");
          this.dom.badgeDot.classList.add("immerse-badge-dot-loading");
          this._updateBadgeText("Loading Ultra-HD...");
        }
      }, 220);
      const tempImg = new Image();
      const onReady = async () => {
        if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;
        if (this._spinnerTimeout) {
          clearTimeout(this._spinnerTimeout);
          this._spinnerTimeout = null;
        }
        if (tempImg.decode) {
          await tempImg.decode().catch(() => {
          });
        }
        if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;
        this.dom.img.src = slide.url;
        const hasPrev = !!(this.dom.imgPrev.src && this.dom.imgPrev.style.display !== "none");
        const dir = this._navDirection || 1;
        const isSlide = this.options.transitionStyle === "slide";
        if (hasPrev) {
          let incomingStartTransform = "";
          let outgoingEndTransform = "";
          let outgoingEndOpacity = "1";
          let easing = "";
          let duration = "";
          if (isSlide) {
            incomingStartTransform = `translate3d(${dir * 100}%, 0, 0)`;
            outgoingEndTransform = `translate3d(${-dir * 100}%, 0, 0)`;
            outgoingEndOpacity = "1";
            easing = "cubic-bezier(0.2, 0, 0, 1)";
            duration = "0.34s";
          } else {
            incomingStartTransform = `translate3d(${dir * 100}%, 0, 0)`;
            outgoingEndTransform = `translate3d(${-dir * 38}%, 0, 0) scale(0.93)`;
            outgoingEndOpacity = "0.4";
            easing = "cubic-bezier(0.16, 1, 0.3, 1)";
            duration = "0.35s";
          }
          this.dom.img.style.transition = "none";
          this.dom.img.style.transform = incomingStartTransform;
          this.dom.img.style.opacity = "1";
          this.dom.img.style.zIndex = "2";
          this.dom.imgPrev.style.transition = "none";
          this.dom.imgPrev.style.transform = "translate3d(0, 0, 0) scale(1)";
          this.dom.imgPrev.style.opacity = "1";
          this.dom.imgPrev.style.zIndex = "1";
          void this.dom.img.offsetWidth;
          requestAnimationFrame(() => {
            this.dom.img.style.transition = `transform ${duration} ${easing}`;
            this.dom.imgPrev.style.transition = `transform ${duration} ${easing}, opacity ${duration} ease`;
            this.dom.img.style.transform = "translate3d(0, 0, 0)";
            this.dom.imgPrev.style.transform = outgoingEndTransform;
            this.dom.imgPrev.style.opacity = outgoingEndOpacity;
          });
        } else {
          this.dom.img.style.transition = "opacity 0.28s var(--immerse-smooth)";
          this.dom.img.style.transform = "translate3d(0, 0, 0)";
          requestAnimationFrame(() => {
            this.dom.img.style.opacity = "1";
          });
        }
        this.dom.spinner.classList.remove("immerse-spinner-visible");
        this.dom.badgeDot.classList.remove("immerse-badge-dot-loading");
        const w = tempImg.naturalWidth;
        const h = tempImg.naturalHeight;
        this._updateBadgeText(`${w} \xD7 ${h} \u2022 Highest Quality`);
        this._transitionTimeout = setTimeout(() => {
          if (this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
            this.dom.imgPrev.style.display = "none";
            this.dom.imgPrev.style.transform = "none";
            this.dom.imgPrev.style.opacity = "0";
            this.dom.img.style.transition = "opacity 0.28s var(--immerse-smooth)";
          }
        }, 360);
        this._preloadAdjacent();
      };
      tempImg.onload = onReady;
      tempImg.onerror = () => {
        if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;
        if (this._spinnerTimeout) clearTimeout(this._spinnerTimeout);
        this.dom.spinner.classList.remove("immerse-spinner-visible");
        this.dom.badgeDot.classList.remove("immerse-badge-dot-loading");
        this.dom.img.src = slide.url;
        this.dom.img.style.opacity = "1";
        this.dom.imgPrev.style.opacity = "0";
        this._updateBadgeText("HD Ready");
      };
      tempImg.src = slide.url;
    }
    _updateHeaderCounter() {
      const currentPostNum = this.currentPostIndex + 1;
      this._updateCounterText(`Photo ${currentPostNum}`);
      this.dom.prevPostBtn.disabled = this.currentPostIndex === 0;
      this.dom.nextPostBtn.disabled = false;
    }
    _updateCarouselControls(post) {
      if (!post || !post.isCarousel && post.slides.length <= 1) {
        this.dom.carouselCtrl.style.display = "none";
        return;
      }
      this.dom.carouselCtrl.style.display = "flex";
      const totalSlides = Math.max(post.totalSlides || 0, post.slides.length);
      const currentSlideNum = this.currentSlideIndex + 1;
      this.dom.carouselLabel.textContent = `Slide ${currentSlideNum} of ${totalSlides}`;
      this.dom.prevSlideBtn.disabled = this.currentSlideIndex === 0;
      const hasNativeNext = !!findNativeCarouselNextButton(post.tile);
      const hasMore = this.currentSlideIndex < totalSlides - 1 || hasNativeNext;
      this.dom.nextSlideBtn.disabled = !hasMore;
      this.dom.dotsContainer.innerHTML = "";
      const dotsCount = Math.max(totalSlides, post.slides.length);
      for (let i = 0; i < dotsCount; i++) {
        const dot = createElement("div", {
          className: `immerse-dot ${i === this.currentSlideIndex ? "immerse-dot-active" : ""}`,
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
      this.resetZoomState();
      if (this.currentPostIndex < this.posts.length - 1) {
        this.goToPost(this.currentPostIndex + 1, 0);
      } else if (this.onLoadMore) {
        this._updateCounterText(`Photo ${this.currentPostIndex + 1} \u2022 Loading...`);
        this._waitingForNextPost = true;
        this.onLoadMore();
      }
    }
    prevPost() {
      this._lastNavTime = Date.now();
      this._navDirection = -1;
      this.resetZoomState();
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
      this._lastNavTime = Date.now();
      this._navDirection = 1;
      this.resetZoomState();
      const post = this.posts[this.currentPostIndex];
      if (!post) return;
      if (this.currentSlideIndex < post.slides.length - 1) {
        this.goToSlide(this.currentSlideIndex + 1);
        this._prefetchNextNativeSlide(post);
        return;
      }
      const nativeNext = findNativeCarouselNextButton(post.tile);
      if (nativeNext) {
        this._advanceNativeCarouselAndGo(post, this.currentSlideIndex + 1);
      }
    }
    prevSlide() {
      this._lastNavTime = Date.now();
      this._navDirection = -1;
      this.resetZoomState();
      if (this.currentSlideIndex > 0) {
        this.goToSlide(this.currentSlideIndex - 1);
      }
    }
    goToSlide(slideIndex) {
      this._lastNavTime = Date.now();
      this._navDirection = slideIndex >= this.currentSlideIndex ? 1 : -1;
      this.resetZoomState();
      const post = this.posts[this.currentPostIndex];
      if (!post) return;
      if (slideIndex < post.slides.length) {
        this.currentSlideIndex = slideIndex;
        this.loadCurrent();
      } else {
        this._advanceNativeCarouselAndGo(post, slideIndex);
      }
    }
    _advanceNativeCarouselAndGo(post, targetSlideIndex) {
      const nativeNext = findNativeCarouselNextButton(post.tile);
      if (!nativeNext) return;
      nativeNext.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      nativeNext.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      let attempts = 0;
      const pollInterval = setInterval(() => {
        attempts++;
        this._syncPostSlides(post);
        if (post.slides.length > targetSlideIndex) {
          clearInterval(pollInterval);
          this.goToSlide(targetSlideIndex);
        } else if (attempts >= 8) {
          clearInterval(pollInterval);
          this._updateCarouselControls(post);
        }
      }, 45);
    }
    _prefetchNextNativeSlide(post) {
      const nativeNext = findNativeCarouselNextButton(post.tile);
      if (!nativeNext) return;
      if (this.currentSlideIndex >= post.slides.length - 2) {
        nativeNext.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        nativeNext.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        setTimeout(() => {
          this._syncPostSlides(post);
          this._updateCarouselControls(post);
        }, 80);
      }
    }
    /* ---------------- Zoom & Pan Transforms ---------------- */
    resetZoomState() {
      this.scale = 1;
      this.panX = 0;
      this.panY = 0;
      if (this.dom?.zoomResetBtn) {
        this.dom.zoomResetBtn.textContent = "100%";
      }
      if (this.dom?.stage) {
        this.dom.stage.classList.remove("immerse-can-pan", "immerse-is-panning");
      }
    }
    resetTransform() {
      this.resetZoomState();
      this._applyTransform(true);
    }
    _applyTransform(smooth = false) {
      if (!this.dom?.img) return;
      if (smooth) {
        this.dom.img.style.transition = "transform 0.22s cubic-bezier(0.2, 0, 0, 1), opacity 0.28s var(--immerse-smooth)";
      } else {
        this.dom.img.style.transition = "opacity 0.28s var(--immerse-smooth)";
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
      const isImageTarget = e.target === this.dom?.shield || e.target === this.dom?.img || e.target === this.dom?.imgWrapper;
      if (!isImageTarget) return;
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
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S" || e.key === "c" || e.key === "C")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const isArrowNav = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "j", "J", "l", "L", "[", "]"].includes(e.key);
      if (!isArrowNav) {
        this._resetIdleTimer();
      }
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          this.close();
          break;
        // Primary Navigation (Posts in Grid)
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          this.nextPost();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          this.prevPost();
          break;
        // Secondary Navigation (Carousel Slides of Current Post)
        case "ArrowDown":
        case "]":
          e.preventDefault();
          this.nextSlide();
          break;
        case "ArrowUp":
        case "[":
          e.preventDefault();
          this.prevSlide();
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
    /**
     * Determines if a mouse event's coordinates are situated directly inside the image bounds.
     *
     * @param {MouseEvent|PointerEvent} e
     * @returns {boolean}
     */
    _isCursorInsideImage(e) {
      if (!this.dom?.img || !this.isOpen) return false;
      if (e.target?.closest?.(".immerse-header, .immerse-nav-btn, .immerse-carousel-controller, .immerse-btn")) {
        return false;
      }
      const edgeMarginX = 55;
      const edgeMarginY = 50;
      const isNearScreenEdge = e.clientY <= edgeMarginY || e.clientY >= window.innerHeight - edgeMarginY || e.clientX <= edgeMarginX || e.clientX >= window.innerWidth - edgeMarginX;
      if (isNearScreenEdge) {
        return false;
      }
      const activeImg = this.dom.img.style.opacity !== "0" || !this.dom.imgPrev?.src ? this.dom.img : this.dom.imgPrev;
      const rect = activeImg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    }
    _handleRootMouseMove(e) {
      if (!this.isOpen) return;
      this._wakeCursor();
      if (this._isCursorInsideImage(e)) {
        return;
      }
      this._resetIdleTimer();
    }
    _handleRootPointerDown(e) {
      if (!this.isOpen) return;
      this._wakeCursor();
      if (this._isCursorInsideImage(e)) {
        return;
      }
      this._resetIdleTimer();
    }
    _wakeCursor() {
      if (!this.dom?.root) return;
      this.dom.root.classList.remove("immerse-cursor-hidden");
      if (this._cursorTimer) clearTimeout(this._cursorTimer);
      this._cursorTimer = setTimeout(() => {
        if (this.isOpen && !this.isDragging) {
          this.dom.root.classList.add("immerse-cursor-hidden");
        }
      }, 2800);
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
      this.tileToButtonMap = /* @__PURE__ */ new Map();
      this.activeButton = null;
      this._initDelegatedHover();
    }
    /**
     * Centralized delegated hover detection ensuring the button appears
     * whenever the user hovers anywhere within a legitimate post grid tile or feed card.
     */
    _initDelegatedHover() {
      let hideTimer = null;
      document.addEventListener("pointerover", (e) => {
        const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: "both" };
        if (!settings.enabled || settings.triggerMode === "image-click") return;
        const target = e.target;
        if (!target) return;
        const tile = target.closest('a[href*="/p/"]') || target.closest("article");
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
            this.activeButton.classList.remove("immerse-visible");
          }
          this.activeButton = btn;
          btn.classList.add("immerse-visible");
        }
      }, { passive: true });
      document.addEventListener("pointerout", (e) => {
        const target = e.target;
        if (!target) return;
        const tile = target.closest('a[href*="/p/"]') || target.closest("article");
        if (tile && this.tileToButtonMap.has(tile)) {
          const related = e.relatedTarget;
          if (!related || !tile.contains(related)) {
            const btn = this.tileToButtonMap.get(tile);
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
              btn.classList.remove("immerse-visible");
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
      const tile = imgElement.closest('a[href*="/p/"]') || imgElement.closest("article") || container;
      if (!tile || this.tileToButtonMap.has(tile)) return;
      if (tile.matches('a[href*="/reel"]') || tile.querySelector('a[href*="/reel"]')) return;
      const mediaContainer = findPostMediaContainer(imgElement);
      const mediaStyle = window.getComputedStyle(mediaContainer);
      if (mediaStyle.position === "static") {
        mediaContainer.style.position = "relative";
      }
      const btnContainer = createElement("div", {
        className: "immerse-hover-btn-container"
      });
      const btn = createElement("button", {
        className: "immerse-hover-btn",
        attributes: {
          type: "button",
          title: "View in Fullscreen Ultra-HD (Immerse)",
          "aria-label": "View in Fullscreen Ultra-HD"
        },
        innerHTML: `
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>HD</span>
      `
      });
      btn.addEventListener("click", (e) => {
        const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: "both" };
        if (!settings.enabled || settings.triggerMode === "image-click") return;
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
      imgElement.addEventListener("click", (e) => {
        const settings = this.getSettings ? this.getSettings() : { enabled: true, triggerMode: "both" };
        if (!settings.enabled) return;
        if (settings.triggerMode === "image-click" || settings.triggerMode === "both") {
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
        this.activeButton.classList.remove("immerse-visible");
        this.activeButton = null;
      }
    }
  };

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
     * Scans a root element strictly for legitimate Instagram post and grid images.
     *
     * @param {HTMLElement} root
     */
    scan(root) {
      if (!root || !root.querySelectorAll) return;
      const postTiles = Array.from(root.querySelectorAll('a[href*="/p/"], article'));
      if (root.matches && (root.matches('a[href*="/p/"]') || root.tagName === "ARTICLE")) {
        postTiles.push(root);
      }
      for (const tile of postTiles) {
        if (tile.matches('a[href*="/reel"]') || tile.querySelector('a[href*="/reel"]')) {
          continue;
        }
        const images = Array.from(tile.querySelectorAll("img[src], img[srcset]"));
        for (const img of images) {
          if (this.processedImages.has(img)) continue;
          if (!isLegitimatePostImage(img)) continue;
          this.processedImages.add(img);
          this.mediaEntries.push({ img, container: tile });
          this.onMediaFound(img, tile);
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
      this.posts = [];
      this.listeners = /* @__PURE__ */ new Set();
    }
    /**
     * Synchronizes and sorts all legitimate post tiles visible in the DOM
     * in visual reading order (top-to-bottom, left-to-right).
     * Preserves previously discovered slides across DOM unmounts.
     *
     * @param {Array<{img: HTMLImageElement, container: HTMLElement}>} mediaEntries
     * @returns {Array<Object>}
     */
    syncSequence(mediaEntries) {
      if (!mediaEntries || mediaEntries.length === 0) return this.posts;
      const validEntries = mediaEntries.filter((entry) => {
        return entry.img && document.body.contains(entry.img) && isLegitimatePostImage(entry.img);
      });
      const postMap = /* @__PURE__ */ new Map();
      for (const entry of validEntries) {
        const tile = entry.container || findClosestPost(entry.img);
        if (!tile) continue;
        if (tile.matches('a[href*="/reel"]') || tile.querySelector('a[href*="/reel"]')) continue;
        if (!postMap.has(tile)) {
          postMap.set(tile, {
            tile,
            images: []
          });
        }
        postMap.get(tile).images.push(entry.img);
      }
      const sortedTiles = Array.from(postMap.values()).sort((a, b) => {
        const rectA = a.tile.getBoundingClientRect();
        const rectB = b.tile.getBoundingClientRect();
        const topDiff = rectA.top + window.scrollY - (rectB.top + window.scrollY);
        if (Math.abs(topDiff) > 25) {
          return topDiff;
        }
        return rectA.left + window.scrollX - (rectB.left + window.scrollX);
      });
      const newPosts = [];
      sortedTiles.forEach((group, postIndex) => {
        const { tile } = group;
        const postImages = findPostImages(tile);
        const existing = this.posts.find((p) => p.tile === tile);
        const uniqueSlides = existing ? [...existing.slides] : [];
        const seenUrls = new Set(uniqueSlides.map((s) => s.url));
        for (const imgEl of postImages) {
          const url = getHighestResolutionUrl(imgEl);
          if (url && !seenUrls.has(url)) {
            seenUrls.add(url);
            uniqueSlides.push({
              url,
              width: imgEl.naturalWidth || 1080,
              height: imgEl.naturalHeight || 1080,
              element: imgEl
            });
          }
        }
        const isCarousel = existing && existing.isCarousel || uniqueSlides.length > 1 || isCarouselPost(tile);
        const estCount = getEstimatedSlideCount(tile);
        const totalSlides = Math.max(existing?.totalSlides || 0, estCount, uniqueSlides.length);
        if (uniqueSlides.length > 0) {
          newPosts.push({
            id: existing?.id || `post-${postIndex}-${uniqueSlides[0].url.slice(-12)}`,
            tile,
            slides: uniqueSlides,
            isCarousel,
            totalSlides
          });
        }
      });
      this.posts = newPosts;
      this._notify();
      return this.posts;
    }
    /**
     * Appends a newly discovered slide to a specific post without duplicating.
     *
     * @param {Object} post
     * @param {Object} slide
     * @returns {Object}
     */
    appendSlide(post, slide) {
      if (!post || !slide || !slide.url) return post;
      if (!post.slides.some((s) => s.url === slide.url)) {
        post.slides.push(slide);
        post.isCarousel = true;
        post.totalSlides = Math.max(post.totalSlides || 0, post.slides.length);
        this._notify();
      }
      return post;
    }
    /**
     * Finds the post index and slide index for a clicked image.
     *
     * @param {HTMLImageElement} targetImg
     * @returns {{postIndex: number, slideIndex: number}}
     */
    findLocation(targetImg) {
      if (!targetImg || this.posts.length === 0) {
        return { postIndex: 0, slideIndex: 0 };
      }
      const targetSrc = targetImg.currentSrc || targetImg.src || "";
      for (let pIdx = 0; pIdx < this.posts.length; pIdx++) {
        const post = this.posts[pIdx];
        for (let sIdx = 0; sIdx < post.slides.length; sIdx++) {
          const slide = post.slides[sIdx];
          if (slide.element === targetImg || targetSrc && slide.url.includes(targetSrc)) {
            return { postIndex: pIdx, slideIndex: sIdx };
          }
        }
      }
      const foundTileIdx = this.posts.findIndex((p) => p.tile.contains(targetImg));
      if (foundTileIdx !== -1) {
        return { postIndex: foundTileIdx, slideIndex: 0 };
      }
      return { postIndex: 0, slideIndex: 0 };
    }
    get length() {
      return this.posts.length;
    }
    getPost(index) {
      return this.posts[index] || null;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    _notify() {
      for (const listener of this.listeners) {
        try {
          listener(this.posts);
        } catch (e) {
          console.error("[GallerySequencer] Listener error:", e);
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
      this.overlay = new ViewerOverlay({
        ...settings,
        onLoadMore: () => this.handleLoadMore()
      });
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
              const updatedPosts = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());
              this.overlay.updatePosts(updatedPosts);
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
              totalPosts: this.sequencer?.length || 0
            });
          } else if (message.type === "SETTINGS_CHANGED") {
            for (const [k, v] of Object.entries(message.settings || {})) {
              settingsStore.set(k, v);
            }
            this.handleSettingsChange(settingsStore.get());
            sendResponse({ success: true });
          }
          return true;
        });
      }
      if (settings.enabled) {
        this.mediaDetector.start();
      }
      this.initialized = true;
      console.log("[Immerse] Instagram High-Resolution Extension loaded.");
    }
    /**
     * Handles opening the fullscreen overlay with the synchronized grid posts.
     *
     * @param {HTMLImageElement} targetImg
     * @param {HTMLElement} container
     */
    handleTrigger(targetImg, container) {
      const settings = settingsStore.get();
      if (!settings.enabled) return;
      const posts = this.sequencer.syncSequence(this.mediaDetector.getMediaEntries());
      if (posts.length > 0) {
        const { postIndex, slideIndex } = this.sequencer.findLocation(targetImg);
        this.overlay.open(posts, postIndex, slideIndex);
      } else {
        const items = this.mediaDetector.resolvePostMediaItems(targetImg, container);
        this.overlay.open([{ id: "post-0", tile: container, slides: items }], 0, 0);
      }
    }
    handleSettingsChange(newSettings) {
      const current = settingsStore.get();
      const merged = { ...current, ...newSettings };
      if (merged.enabled) {
        this.mediaDetector.start();
      } else {
        this.mediaDetector.stop();
        if (this.overlay?.isOpen) {
          this.overlay.close();
        }
        this.hoverButtons.hideAll();
      }
      if (this.overlay) {
        this.overlay.updateSettings(merged);
      }
    }
    /**
     * Triggers background scrolling on the underlying page so Instagram loads the next batch of grid posts.
     */
    handleLoadMore() {
      const target = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollTo({ top: target, behavior: "instant" });
      window.dispatchEvent(new Event("scroll"));
      document.dispatchEvent(new Event("scroll"));
      const mainEl = document.querySelector("main") || document.querySelector('div[role="main"]');
      if (mainEl && mainEl.scrollHeight > mainEl.clientHeight) {
        mainEl.scrollTop = mainEl.scrollHeight;
        mainEl.dispatchEvent(new Event("scroll"));
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
