import { createElement } from '../../utils/dom-helpers.js';

export function createOverlayDom(overlay) {
  // Overlay Root
  const root = createElement('div', {
    className: 'immerse-overlay-root',
    attributes: { 'aria-modal': 'true', role: 'dialog' }
  });

  // Deep optical backdrop
  const backdrop = createElement('div', {
    className: 'immerse-backdrop',
    events: { click: (e) => {
      if (e.target === backdrop || e.target === stage) overlay.close();
    }}
  });

  // Header bar
  const header = createElement('div', { className: 'immerse-header' });

  // Resolution badge (default off, clean text without green dot)
  const badgeText = createElement('span', {
    className: 'immerse-badge-text',
    textContent: 'Immersive View'
  });
  const showBadge = !!overlay.options.showResolutionBadge;
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
    events: { click: () => overlay.nav.openPostOnInstagram() }
  });

  // Zoom reset button
  const zoomResetBtn = createElement('button', {
    className: 'immerse-btn immerse-btn-zoom',
    textContent: '100%',
    attributes: { title: 'Reset zoom (0)', 'aria-label': 'Reset zoom' },
    events: { click: () => overlay.zoom.resetTransform() }
  });

  // Fullscreen button
  const fullscreenBtn = createElement('button', {
    className: 'immerse-btn immerse-btn-fullscreen',
    innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    attributes: { title: 'Toggle Fullscreen (F)', 'aria-label': 'Toggle Fullscreen' },
    events: { click: () => overlay.events.toggleNativeFullscreen() }
  });

  // Close button
  const closeBtn = createElement('button', {
    className: 'immerse-btn immerse-btn-close',
    innerHTML: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    attributes: { title: 'Close (Esc)', 'aria-label': 'Close' },
    events: { click: () => overlay.close() }
  });

  controls.append(viewPostBtn, zoomResetBtn, fullscreenBtn, closeBtn);
  header.append(headerLeft, controls);

  // Stage area
  const stage = createElement('div', {
    className: 'immerse-stage',
    events: {
      wheel: overlay.zoom.handleWheel,
      mousedown: overlay.zoom.handleMouseDown,
      dblclick: overlay.zoom.handleDblClick
    }
  });

  // Primary Navigation Buttons: Navigate between POSTS in the grid
  const prevPostBtn = createElement('button', {
    className: 'immerse-nav-btn immerse-nav-prev',
    innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>',
    attributes: { title: 'Previous Post (Left Arrow)', 'aria-label': 'Previous Post' },
    events: {
      click: (e) => { e.stopPropagation(); overlay.nav.prevPost(); },
      dblclick: (e) => { e.stopPropagation(); e.preventDefault(); }
    }
  });

  const nextPostBtn = createElement('button', {
    className: 'immerse-nav-btn immerse-nav-next',
    innerHTML: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
    attributes: { title: 'Next Post (Right Arrow)', 'aria-label': 'Next Post' },
    events: {
      click: (e) => { e.stopPropagation(); overlay.nav.nextPost(); },
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
      click: (e) => { e.stopPropagation(); overlay.nav.prevSlide(); },
      dblclick: (e) => { e.stopPropagation(); e.preventDefault(); }
    }
  });

  const dotsContainer = createElement('div', { className: 'immerse-dots' });

  const nextSlideBtn = createElement('button', {
    className: 'immerse-carousel-btn',
    innerHTML: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>',
    attributes: { title: 'Next Slide (Down Arrow)', 'aria-label': 'Next Slide' },
    events: {
      click: (e) => { e.stopPropagation(); overlay.nav.nextSlide(); },
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

  return {
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
}
