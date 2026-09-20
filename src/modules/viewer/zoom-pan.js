export class ZoomPanController {
  constructor(overlay) {
    this.overlay = overlay;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this._targetScale = 1;
    this._targetPanX = 0;
    this._targetPanY = 0;
    this._zoomRafId = null;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.minScale = 0.5;
    this.maxScale = 6;

    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleDblClick = this.handleDblClick.bind(this);
  }

  resetZoomState() {
    if (this._zoomRafId) {
      cancelAnimationFrame(this._zoomRafId);
      this._zoomRafId = null;
    }
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this._targetScale = 1;
    this._targetPanX = 0;
    this._targetPanY = 0;
    
    const dom = this.overlay.dom;
    if (dom?.zoomResetBtn) {
      dom.zoomResetBtn.textContent = '100%';
    }
    if (dom?.stage) {
      dom.stage.classList.remove('immerse-can-pan', 'immerse-is-panning');
    }
  }

  resetTransform() {
    this.resetZoomState();
    this._applyTransform(true);
  }

  _applyTransform(smooth = false) {
    const dom = this.overlay.dom;
    if (!dom?.img) return;

    if (smooth) {
      dom.img.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1), opacity 0.28s var(--immerse-smooth)';
    } else {
      dom.img.style.transition = 'opacity 0.28s var(--immerse-smooth)';
    }

    dom.img.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.scale})`;
    if (dom.zoomResetBtn) {
      dom.zoomResetBtn.textContent = `${Math.round(this.scale * 100)}%`;
    }

    if (this.scale > 1.05) {
      dom.stage.classList.add('immerse-can-pan');
    } else {
      dom.stage.classList.remove('immerse-can-pan', 'immerse-is-panning');
    }
  }

  handleWheel(e) {
    if (!this.overlay.isOpen) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.overlay.options.wheelZoom === false) return;

    let delta = -e.deltaY;
    if (e.deltaMode === 1) { 
      delta *= 32;
    } else if (e.deltaMode === 2) { 
      delta *= 300;
    }

    delta = Math.max(-140, Math.min(140, delta));
    const zoomFactor = Math.exp(delta * 0.002);
    const newTargetScale = Math.max(this.minScale, Math.min(this.maxScale, this._targetScale * zoomFactor));

    if (Math.abs(newTargetScale - this._targetScale) < 0.0001) return;

    const rect = this.overlay.dom.stage.getBoundingClientRect();
    const mouseX = e.clientX - (rect.left + rect.width / 2);
    const mouseY = e.clientY - (rect.top + rect.height / 2);

    const ratio = newTargetScale / this._targetScale;
    let newTargetPanX = mouseX - (mouseX - this._targetPanX) * ratio;
    let newTargetPanY = mouseY - (mouseY - this._targetPanY) * ratio;

    if (newTargetScale <= 1) {
      newTargetPanX = 0;
      newTargetPanY = 0;
    }

    this._targetScale = newTargetScale;
    this._targetPanX = newTargetPanX;
    this._targetPanY = newTargetPanY;

    this._startZoomRaf();
  }

  _startZoomRaf() {
    if (this._zoomRafId) return;

    const tick = () => {
      const ease = 0.28;
      const diffScale = this._targetScale - this.scale;
      const diffPanX = this._targetPanX - this.panX;
      const diffPanY = this._targetPanY - this.panY;

      if (Math.abs(diffScale) < 0.001 && Math.abs(diffPanX) < 0.2 && Math.abs(diffPanY) < 0.2) {
        this.scale = this._targetScale;
        this.panX = this._targetPanX;
        this.panY = this._targetPanY;
        this._applyTransform(false);
        this._zoomRafId = null;
        return;
      }

      this.scale += diffScale * ease;
      this.panX += diffPanX * ease;
      this.panY += diffPanY * ease;

      this._applyTransform(false);
      this._zoomRafId = requestAnimationFrame(tick);
    };

    this._zoomRafId = requestAnimationFrame(tick);
  }

  handleMouseDown(e) {
    if (!this.overlay.isOpen || e.button !== 0) return;
    if (this.scale <= 1) return;

    if (this._zoomRafId) {
      cancelAnimationFrame(this._zoomRafId);
      this._zoomRafId = null;
    }
    this._targetScale = this.scale;
    this._targetPanX = this.panX;
    this._targetPanY = this.panY;

    this.isDragging = true;
    this.startX = e.clientX - this.panX;
    this.startY = e.clientY - this.panY;
    this.overlay.dom.stage.classList.add('immerse-is-panning');
    e.preventDefault();
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;
    this.panX = e.clientX - this.startX;
    this.panY = e.clientY - this.startY;
    this._targetPanX = this.panX;
    this._targetPanY = this.panY;
    this._applyTransform(false);
  }

  handleMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      this.overlay.dom?.stage.classList.remove('immerse-is-panning');
    }
  }

  handleDblClick(e) {
    if (!this.overlay.isOpen) return;

    if (this._zoomRafId) {
      cancelAnimationFrame(this._zoomRafId);
      this._zoomRafId = null;
    }

    const dom = this.overlay.dom;
    const isImageTarget = e.target === dom?.shield ||
                          e.target === dom?.img ||
                          e.target === dom?.imgWrapper;
    if (!isImageTarget) return;

    if (Date.now() - this.overlay.nav.lastNavTime < 350) return;

    e.preventDefault();

    if (this.scale > 1.1) {
      this.resetTransform();
    } else {
      this.scale = 2.5;
      const rect = dom.stage.getBoundingClientRect();
      const mouseX = e.clientX - (rect.left + rect.width / 2);
      const mouseY = e.clientY - (rect.top + rect.height / 2);
      this.panX = -mouseX * 1.5;
      this.panY = -mouseY * 1.5;
      this._targetScale = this.scale;
      this._targetPanX = this.panX;
      this._targetPanY = this.panY;
      this._applyTransform(true);
    }
  }

  zoomIn() {
    if (this._zoomRafId) {
      cancelAnimationFrame(this._zoomRafId);
      this._zoomRafId = null;
    }
    this.scale = Math.min(this.maxScale, this.scale * 1.25);
    this._targetScale = this.scale;
    this._targetPanX = this.panX;
    this._targetPanY = this.panY;
    this._applyTransform(true);
  }

  zoomOut() {
    if (this._zoomRafId) {
      cancelAnimationFrame(this._zoomRafId);
      this._zoomRafId = null;
    }
    this.scale = Math.max(this.minScale, this.scale / 1.25);
    if (this.scale <= 1) { this.panX = 0; this.panY = 0; }
    this._targetScale = this.scale;
    this._targetPanX = this.panX;
    this._targetPanY = this.panY;
    this._applyTransform(true);
  }
}
