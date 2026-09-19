import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPostMediaContainer,
  isCarouselPost,
  getEstimatedSlideCount
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
