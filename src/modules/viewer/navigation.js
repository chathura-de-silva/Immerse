import { findPostImages, isCarouselPost, getEstimatedSlideCount, findNativeCarouselNextButton, isFeedContext, createElement } from '../../utils/dom-helpers.js';
import { getHighestResolutionUrl } from '../../utils/srcset-parser.js';

export class NavigationController {
  constructor(overlay) {
    this.overlay = overlay;
    
    // State migrated from ViewerOverlay
    this.posts = [];
    this.currentPostIndex = 0;
    this.currentSlideIndex = 0;
    this.pendingNavigation = null;
    this.navPollInterval = null;
    this.loadMoreRetryInterval = null;
    this.activeLoadingImg = null;
    this.navDirection = 1;
    this.isTransitioning = false;
    this.isLoading = false;
    this.lastNavTime = 0;
    
    this.transitionTimeout = null;
    this.spinnerTimeout = null;
    this.waitingTimeout = null;
  }

  updatePosts(newPosts) {
    if (!newPosts || newPosts.length === 0) return;

    const activePost = this.posts[this.currentPostIndex];
    if (activePost) {
      const newActiveIdx = newPosts.findIndex(p => p.id === activePost.id || (p.tile && p.tile === activePost.tile));
      if (newActiveIdx !== -1) {
        this.currentPostIndex = newActiveIdx;
      }
    }

    this.posts = newPosts;

    if (this.pendingNavigation && this.pendingNavigation.type === 'post') {
      const nextTargetIdx = this.pendingNavigation.fromPostIndex + 1;
      if (this.posts.length > nextTargetIdx) {
        this.pendingNavigation = null;
        if (this.waitingTimeout) {
          clearTimeout(this.waitingTimeout);
          this.waitingTimeout = null;
        }
        if (this.loadMoreRetryInterval) {
          clearInterval(this.loadMoreRetryInterval);
          this.loadMoreRetryInterval = null;
        }
        this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
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

  loadCurrent() {
    const post = this.posts[this.currentPostIndex];
    if (!post || !post.slides || post.slides.length === 0) return;

    this.completeTransitionImmediately();

    if (this.spinnerTimeout) {
      clearTimeout(this.spinnerTimeout);
      this.spinnerTimeout = null;
    }

    this._syncPostSlides(post);
    this.currentSlideIndex = Math.max(0, Math.min(this.currentSlideIndex, post.slides.length - 1));
    const slide = post.slides[this.currentSlideIndex];

    if (this.currentPostIndex >= this.posts.length - 1 && this.overlay.onLoadMore) {
      this.overlay.onLoadMore();
    }

    this.overlay.zoom.resetZoomState();
    this._updateHeaderCounter();
    this._updateCarouselControls(post);

    if (this.overlay.dom.img.src === slide.url && this.overlay.dom.img.style.opacity === '1') {
      this._preloadAdjacent();
      return;
    }

    const targetPostIndex = this.currentPostIndex;
    const targetSlideIndex = this.currentSlideIndex;
    this.isLoading = true;

    this.spinnerTimeout = setTimeout(() => {
      if (this.isLoading && this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
        this.overlay.dom.spinner.classList.add('immerse-spinner-visible');
        if (this.overlay.options.showResolutionBadge) {
          this.overlay._updateBadgeText('Just a moment...');
        }
      }
    }, 80);

    if (this.activeLoadingImg) {
      this.activeLoadingImg.onload = null;
      this.activeLoadingImg.onerror = null;
      this.activeLoadingImg = null;
    }

    const tempImg = new Image();
    this.activeLoadingImg = tempImg;

    const onReady = async () => {
      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;

      if (this.spinnerTimeout) {
        clearTimeout(this.spinnerTimeout);
        this.spinnerTimeout = null;
      }
      this.isLoading = false;
      this.activeLoadingImg = null;
      this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');

      if (tempImg.decode) {
        await tempImg.decode().catch(() => {});
      }

      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;

      const dom = this.overlay.dom;
      const prevUrl = (dom.img.src && dom.img.style.opacity !== '0' && dom.img.style.display !== 'none')
        ? dom.img.src
        : null;
      const hasPrev = !!prevUrl;
      const dir = this.navDirection || 1;
      const isFlat = this.overlay.options.transitionStyle === 'flat' || this.overlay.options.transitionStyle === 'slide';

      if (hasPrev) {
        this.isTransitioning = true;

        dom.imgPrev.src = prevUrl;
        dom.imgPrev.style.display = 'block';
        dom.imgPrev.style.transition = 'none';
        dom.imgPrev.style.transform = 'translate3d(0, 0, 0)';
        dom.imgPrev.style.filter = 'none';
        dom.imgPrev.style.opacity = '1';
        dom.imgPrev.style.zIndex = '1';

        dom.img.src = slide.url;

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
          incomingStartTransform = `translate3d(${slideOffset}px, 0, 0)`;
          outgoingEndTransform = `translate3d(${-slideOffset}px, 0, 0)`;
          outgoingEndOpacity = '1';
          outgoingFilter = 'none';
          incomingShadow = 'none';
          easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
          duration = '0.44s';
        } else {
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

        dom.img.style.transition = 'none';
        dom.img.style.transform = incomingStartTransform;
        dom.img.style.boxShadow = incomingShadow;
        dom.img.style.opacity = '1';
        dom.img.style.zIndex = '2';

        void dom.img.offsetWidth;

        requestAnimationFrame(() => {
          dom.img.style.transition = `transform ${duration} ${easing}`;
          dom.imgPrev.style.transition = isFlat
            ? `transform ${duration} ${easing}`
            : `transform ${duration} ${easing}, opacity ${duration} ${easing}, filter ${duration} ${easing}`;

          dom.img.style.transform = 'translate3d(0, 0, 0)';
          dom.imgPrev.style.transform = outgoingEndTransform;
          dom.imgPrev.style.opacity = outgoingEndOpacity;
          dom.imgPrev.style.filter = outgoingFilter;
        });

        this.transitionTimeout = setTimeout(() => {
          if (this.currentPostIndex === targetPostIndex && this.currentSlideIndex === targetSlideIndex) {
            dom.imgPrev.style.display = 'none';
            dom.imgPrev.style.transform = 'none';
            dom.imgPrev.style.opacity = '0';
            dom.imgPrev.style.filter = 'none';
            dom.img.style.boxShadow = 'none';
            dom.img.style.transition = 'opacity 0.28s var(--immerse-smooth)';
            this.isTransitioning = false;
          }
        }, isFlat ? 470 : 570);
      } else {
        dom.img.src = slide.url;
        dom.img.style.transition = 'opacity 0.32s var(--immerse-smooth)';
        dom.img.style.transform = 'translate3d(0, 0, 0)';
        dom.img.style.boxShadow = 'none';
        requestAnimationFrame(() => {
          dom.img.style.opacity = '1';
        });
      }

      const w = tempImg.naturalWidth;
      const h = tempImg.naturalHeight;
      this.overlay._updateBadgeText(`${w} × ${h} • Highest Quality`);
      this._preloadAdjacent();
    };

    tempImg.onload = onReady;
    tempImg.onerror = () => {
      if (this.currentPostIndex !== targetPostIndex || this.currentSlideIndex !== targetSlideIndex) return;
      if (this.spinnerTimeout) clearTimeout(this.spinnerTimeout);
      this.isLoading = false;
      this.isTransitioning = false;
      this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
      this.overlay.dom.img.src = slide.url;
      this.overlay.dom.img.style.opacity = '1';
      this.overlay.dom.imgPrev.style.opacity = '0';
      this.overlay.dom.imgPrev.style.display = 'none';
      this.overlay._updateBadgeText(' No Resolution Info');
    };

    tempImg.src = slide.url;
  }

  _updateHeaderCounter() {
    const post = this.posts[this.currentPostIndex];
    const isFeed = isFeedContext(post?.tile);

    if (isFeed) {
      this.overlay.dom.counter.style.display = 'none';
    } else {
      this.overlay.dom.counter.style.display = 'inline-flex';
      const currentPostNum = this.currentPostIndex + 1;
      this.overlay._updateCounterText(`Photo ${currentPostNum}`);
    }

    if (this.overlay.dom?.viewPostBtn) {
      const url = this.getCurrentPostUrl();
      this.overlay.dom.viewPostBtn.style.display = url ? 'inline-flex' : 'none';
    }

    this.overlay.dom.prevPostBtn.disabled = this.currentPostIndex === 0;
    this.overlay.dom.nextPostBtn.disabled = false;
  }

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

  openPostOnInstagram() {
    const url = this.getCurrentPostUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  _updateCarouselControls(post) {
    const isFeed = isFeedContext(post?.tile);

    if (!isFeed || !post || (!post.isCarousel && post.slides.length <= 1)) {
      this.overlay.dom.carouselCtrl.style.display = 'none';
      return;
    }

    this.overlay.dom.carouselCtrl.style.display = 'flex';
    const totalSlides = Math.max(post.totalSlides || 0, post.slides.length);
    const currentSlideNum = this.currentSlideIndex + 1;

    this.overlay.dom.carouselLabel.textContent = `Slide ${currentSlideNum} of ${totalSlides}`;
    this.overlay.dom.prevSlideBtn.disabled = this.currentSlideIndex === 0;

    const hasNativeNext = !!findNativeCarouselNextButton(post.tile);
    const hasMore = this.currentSlideIndex < totalSlides - 1 || hasNativeNext;
    this.overlay.dom.nextSlideBtn.disabled = !hasMore;

    this.overlay.dom.dotsContainer.innerHTML = '';
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
      this.overlay.dom.dotsContainer.appendChild(dot);
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

  nextPost() {
    this.lastNavTime = Date.now();
    this.navDirection = 1;
    this.overlay.zoom.resetZoomState();
    if (this.currentPostIndex < this.posts.length - 1) {
      this.goToPost(this.currentPostIndex + 1, 0);
    } else {
      this.pendingNavigation = {
        type: 'post',
        direction: 1,
        fromPostIndex: this.currentPostIndex
      };
      this.overlay.dom.spinner.classList.add('immerse-spinner-visible');

      if (this.overlay.onLoadMore) {
        this.overlay.onLoadMore();

        if (this.loadMoreRetryInterval) clearInterval(this.loadMoreRetryInterval);
        let retries = 0;
        this.loadMoreRetryInterval = setInterval(() => {
          retries++;
          if (this.pendingNavigation?.type === 'post') {
            if (this.posts.length > this.pendingNavigation.fromPostIndex + 1) {
              const target = this.pendingNavigation.fromPostIndex + 1;
              this.pendingNavigation = null;
              clearInterval(this.loadMoreRetryInterval);
              this.loadMoreRetryInterval = null;
              if (this.waitingTimeout) {
                clearTimeout(this.waitingTimeout);
                this.waitingTimeout = null;
              }
              this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
              this.goToPost(target, 0);
            } else if (retries < 6) {
              this.overlay.onLoadMore();
            } else {
              clearInterval(this.loadMoreRetryInterval);
              this.loadMoreRetryInterval = null;
            }
          } else {
            clearInterval(this.loadMoreRetryInterval);
            this.loadMoreRetryInterval = null;
          }
        }, 750);
      }

      if (this.waitingTimeout) clearTimeout(this.waitingTimeout);
      this.waitingTimeout = setTimeout(() => {
        if (this.pendingNavigation?.type === 'post') {
          this.pendingNavigation = null;
          this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
        }
        if (this.loadMoreRetryInterval) {
          clearInterval(this.loadMoreRetryInterval);
          this.loadMoreRetryInterval = null;
        }
      }, 7000);
    }
  }

  prevPost() {
    this.lastNavTime = Date.now();
    this.navDirection = -1;
    this.overlay.zoom.resetZoomState();
    this.pendingNavigation = null;
    if (this.loadMoreRetryInterval) {
      clearInterval(this.loadMoreRetryInterval);
      this.loadMoreRetryInterval = null;
    }
    if (this.currentPostIndex > 0) {
      this.goToPost(this.currentPostIndex - 1, 0);
    }
  }

  goToPost(postIndex, slideIndex = 0) {
    this.lastNavTime = Date.now();
    this.navDirection = postIndex >= this.currentPostIndex ? 1 : -1;
    this.overlay.zoom.resetZoomState();
    this.currentPostIndex = postIndex;
    this.currentSlideIndex = slideIndex;
    this.loadCurrent();
  }

  nextSlide() {
    const post = this.posts[this.currentPostIndex];
    if (!post || !isFeedContext(post.tile)) return;
    this.lastNavTime = Date.now();
    this.navDirection = 1;
    this.overlay.zoom.resetZoomState();

    if (this.currentSlideIndex < post.slides.length - 1) {
      this.goToSlide(this.currentSlideIndex + 1);
      this._prefetchNextNativeSlide(post);
      return;
    }

    const targetSlide = this.currentSlideIndex + 1;
    this.pendingNavigation = {
      type: 'slide',
      direction: 1,
      targetSlideIndex: targetSlide
    };
    this.overlay.dom.spinner.classList.add('immerse-spinner-visible');
    this._advanceNativeCarouselAndGo(post, targetSlide);
  }

  prevSlide() {
    const post = this.posts[this.currentPostIndex];
    if (!post || !isFeedContext(post.tile)) return;
    this.lastNavTime = Date.now();
    this.navDirection = -1;
    this.overlay.zoom.resetZoomState();
    this.pendingNavigation = null;
    if (this.navPollInterval) {
      clearInterval(this.navPollInterval);
      this.navPollInterval = null;
    }
    if (this.currentSlideIndex > 0) {
      this.goToSlide(this.currentSlideIndex - 1);
    }
  }

  goToSlide(slideIndex) {
    const post = this.posts[this.currentPostIndex];
    if (!post || !isFeedContext(post.tile)) return;
    this.lastNavTime = Date.now();
    this.navDirection = slideIndex >= this.currentSlideIndex ? 1 : -1;
    this.overlay.zoom.resetZoomState();

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
      if (this.pendingNavigation?.type === 'slide') {
        this.pendingNavigation = null;
        this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
      }
      return;
    }

    nativeNext.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    nativeNext.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    if (this.navPollInterval) clearInterval(this.navPollInterval);
    let attempts = 0;
    this.navPollInterval = setInterval(() => {
      attempts++;
      this._syncPostSlides(post);

      if (post.slides.length > targetSlideIndex) {
        clearInterval(this.navPollInterval);
        this.navPollInterval = null;
        this.pendingNavigation = null;
        this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
        this.goToSlide(targetSlideIndex);
      } else if (attempts >= 45) {
        clearInterval(this.navPollInterval);
        this.navPollInterval = null;
        if (this.pendingNavigation?.type === 'slide') {
          this.pendingNavigation = null;
          this.overlay.dom.spinner.classList.remove('immerse-spinner-visible');
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

  completeTransitionImmediately() {
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
      this.transitionTimeout = null;
    }
    const dom = this.overlay.dom;
    if (dom?.imgPrev) {
      dom.imgPrev.style.transition = 'none';
      dom.imgPrev.style.display = 'none';
      dom.imgPrev.style.transform = 'none';
      dom.imgPrev.style.filter = 'none';
      dom.imgPrev.style.opacity = '0';
    }
    if (dom?.img) {
      dom.img.style.transition = 'none';
      dom.img.style.transform = 'translate3d(0, 0, 0)';
      dom.img.style.boxShadow = 'none';
      dom.img.style.opacity = '1';
    }
    this.isTransitioning = false;
  }
}
