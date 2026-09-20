export class EventsController {
  constructor(overlay) {
    this.overlay = overlay;
    this.idleTimer = null;
    this.cursorTimer = null;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleRootMouseMove = this.handleRootMouseMove.bind(this);
    this.handleRootPointerDown = this.handleRootPointerDown.bind(this);
    this.handleFullscreenChange = this.handleFullscreenChange.bind(this);
  }

  setup() {
    const { dom, zoom } = this.overlay;
    document.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('mousemove', zoom.handleMouseMove);
    document.addEventListener('mouseup', zoom.handleMouseUp);
    dom.root.addEventListener('mousemove', this.handleRootMouseMove);
    dom.root.addEventListener('pointerdown', this.handleRootPointerDown);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    
    this.resetIdleTimer();
    this.wakeCursor();
    this.enterNativeFullscreen();
    this.updateFullscreenButtonState();
  }

  cleanup() {
    const { dom, zoom } = this.overlay;
    document.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('mousemove', zoom.handleMouseMove);
    document.removeEventListener('mouseup', zoom.handleMouseUp);
    
    // We don't necessarily need to remove root listeners if root is destroyed, 
    // but document listener is important.
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.cursorTimer) {
      clearTimeout(this.cursorTimer);
      this.cursorTimer = null;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  handleKeyDown(e) {
    if (!this.overlay.isOpen) return;

    // Actively block save and copy shortcuts
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Keyboard arrow keys navigate without waking up auto-hidden controls
    const isArrowNav = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'j', 'J', 'l', 'L', '[', ']'].includes(e.key);
    if (!isArrowNav) {
      this.resetIdleTimer();
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.overlay.close();
        break;

      // Primary Navigation (Posts in Grid)
      case 'ArrowRight':
      case 'l':
      case 'L':
        e.preventDefault();
        this.overlay.nav.nextPost();
        break;
      case 'ArrowLeft':
      case 'j':
      case 'J':
        e.preventDefault();
        this.overlay.nav.prevPost();
        break;

      // Secondary Navigation (Carousel Slides of Current Post)
      case 'ArrowDown':
      case ']':
        e.preventDefault();
        this.overlay.nav.nextSlide();
        break;
      case 'ArrowUp':
      case '[':
        e.preventDefault();
        this.overlay.nav.prevSlide();
        break;

      case 'f':
      case 'F':
        e.preventDefault();
        this.toggleNativeFullscreen();
        break;
      case 'v':
      case 'V':
        e.preventDefault();
        this.overlay.nav.openPostOnInstagram();
        break;
      case '0':
        e.preventDefault();
        this.overlay.zoom.resetTransform();
        break;
      case '+':
      case '=':
        e.preventDefault();
        this.overlay.zoom.zoomIn();
        break;
      case '-':
      case '_':
        e.preventDefault();
        this.overlay.zoom.zoomOut();
        break;
    }
  }

  isCursorInsideImage(e) {
    const { dom, isOpen, zoom } = this.overlay;
    if (!dom?.img || !isOpen) return false;

    if (e.target?.closest?.('.immerse-header, .immerse-nav-btn, .immerse-carousel-controller, .immerse-btn')) {
      return false;
    }

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

    const activeImg = (dom.img.style.opacity !== '0' || !dom.imgPrev?.src) ? dom.img : dom.imgPrev;
    const rect = activeImg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  handleRootMouseMove(e) {
    if (!this.overlay.isOpen) return;

    this.wakeCursor();

    if (this.isCursorInsideImage(e)) {
      return;
    }

    this.resetIdleTimer();
  }

  handleRootPointerDown(e) {
    if (!this.overlay.isOpen) return;

    this.wakeCursor();

    if (this.isCursorInsideImage(e)) {
      return;
    }

    this.resetIdleTimer();
  }

  wakeCursor() {
    const { dom, isOpen, zoom } = this.overlay;
    if (!dom?.root) return;
    dom.root.classList.remove('immerse-cursor-hidden');

    if (this.cursorTimer) clearTimeout(this.cursorTimer);
    this.cursorTimer = setTimeout(() => {
      if (isOpen && !zoom.isDragging) {
        dom.root.classList.add('immerse-cursor-hidden');
      }
    }, 2800);
  }

  resetIdleTimer() {
    const { dom, isOpen, zoom } = this.overlay;
    if (!dom?.root) return;
    dom.root.classList.remove('immerse-controls-hidden');

    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (isOpen && !zoom.isDragging) {
        dom.root.classList.add('immerse-controls-hidden');
      }
    }, 3200);
  }

  enterNativeFullscreen() {
    const { dom } = this.overlay;
    if (!document.fullscreenElement && dom?.root?.requestFullscreen) {
      dom.root.requestFullscreen().catch(() => {});
    }
  }

  updateFullscreenButtonState() {
    const { dom } = this.overlay;
    if (!dom?.fullscreenBtn) return;
    const isFs = !!document.fullscreenElement;
    if (isFs) {
      dom.fullscreenBtn.title = 'Back to Browser View (F)';
      dom.fullscreenBtn.setAttribute('aria-label', 'Back to Browser View');
      dom.fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
    } else {
      dom.fullscreenBtn.title = 'Enter Fullscreen (F)';
      dom.fullscreenBtn.setAttribute('aria-label', 'Enter Fullscreen');
      dom.fullscreenBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    }
  }

  handleFullscreenChange() {
    this.updateFullscreenButtonState();
  }

  toggleNativeFullscreen() {
    const { dom } = this.overlay;
    if (!document.fullscreenElement) {
      if (dom?.root?.requestFullscreen) {
        dom.root.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }
}
