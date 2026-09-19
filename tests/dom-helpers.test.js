import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPostMediaContainer,
  isCarouselPost,
  getEstimatedSlideCount,
  isLegitimatePhotoPost
} from '../src/utils/dom-helpers.js';

test('isCarouselPost identifies carousel from multiple images or text counter', () => {
  // Mock element with text "1/5"
  const mockTileWithCounter = {
    querySelectorAll: () => [],
    querySelector: () => null,
    innerText: '1/5 photo slide',
    textContent: '1/5 photo slide'
  };
  assert.equal(isCarouselPost(mockTileWithCounter), true);
  assert.equal(getEstimatedSlideCount(mockTileWithCounter), 5);

  // Mock tile with single image and no indicators
  const mockSingleTile = {
    querySelectorAll: () => [],
    querySelector: () => null,
    innerText: 'Caption here',
    textContent: 'Caption here'
  };
  assert.equal(isCarouselPost(mockSingleTile), false);
  assert.equal(getEstimatedSlideCount(mockSingleTile), 1);
});

test('findPostMediaContainer resolves post link if present', () => {
  const mockLink = { tagName: 'A' };
  const mockImg = {
    closest: (selector) => selector.includes('a[href*="/p/"]') ? mockLink : null
  };
  assert.equal(findPostMediaContainer(mockImg), mockLink);
});

test('findPostMediaContainer isolates media wrapper inside feed article without header', () => {
  const mockArticle = { tagName: 'ARTICLE' };
  const mockPostCard = {
    tagName: 'DIV',
    parentElement: mockArticle,
    querySelector: (sel) => sel.includes('header') ? { tagName: 'HEADER' } : null
  };
  const mockMediaWrapper = {
    tagName: 'DIV',
    parentElement: mockPostCard,
    querySelector: () => null
  };
  const mockImg = {
    tagName: 'IMG',
    parentElement: mockMediaWrapper,
    closest: (sel) => sel.includes('article') ? mockArticle : null
  };

  const resolved = findPostMediaContainer(mockImg);
  assert.equal(resolved, mockMediaWrapper);
});

test('isLegitimatePhotoPost strictly rejects reels, videos, and sponsored ads', () => {
  // 1. Reel post
  const mockReel = {
    matches: (sel) => sel.includes('/reel'),
    querySelector: () => null,
    querySelectorAll: () => [],
    innerText: ''
  };
  assert.equal(isLegitimatePhotoPost(mockReel), false);

  // 2. Video post with <video> element
  const mockVideo = {
    matches: () => false,
    querySelector: (sel) => sel.includes('video') ? { tagName: 'VIDEO' } : null,
    querySelectorAll: () => [],
    innerText: ''
  };
  assert.equal(isLegitimatePhotoPost(mockVideo), false);

  // 3. Video post with audio/mute button
  const mockAudioPost = {
    matches: () => false,
    querySelector: (sel) => sel.includes('Audio') ? { tagName: 'BUTTON' } : null,
    querySelectorAll: () => [],
    innerText: ''
  };
  assert.equal(isLegitimatePhotoPost(mockAudioPost), false);

  // 4. Sponsored post with ad link
  const mockAdPost = {
    matches: () => false,
    querySelector: (sel) => sel.includes('l.instagram.com') ? { tagName: 'A' } : null,
    querySelectorAll: () => [],
    innerText: ''
  };
  assert.equal(isLegitimatePhotoPost(mockAdPost), false);

  // 5. Sponsored post with CTA button
  const mockCtaAd = {
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: (sel) => sel.includes('button') ? [{ innerText: 'Shop Now' }] : [],
    innerText: 'Discover brand new collection'
  };
  assert.equal(isLegitimatePhotoPost(mockCtaAd), false);

  // 6. Sponsored post with Sponsored text in header
  const mockSponsoredText = {
    matches: () => false,
    querySelector: (sel) => sel === 'header' ? { innerText: 'Sponsored' } : null,
    querySelectorAll: () => [],
    innerText: 'Sponsored'
  };
  assert.equal(isLegitimatePhotoPost(mockSponsoredText), false);

  // 7. Legitimate photo post
  const mockPhotoPost = {
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    innerText: 'Beautiful sunset in the mountains #photography'
  };
  assert.equal(isLegitimatePhotoPost(mockPhotoPost), true);
});
