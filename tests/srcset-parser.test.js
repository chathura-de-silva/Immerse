import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrcset, extractWidthFromUrl, getHighestResolutionUrl } from '../src/utils/srcset-parser.js';

test('parseSrcset correctly parses standard Instagram srcset with width descriptors', () => {
  const srcset = [
    'https://instagram.cdn/v1/pic_150.jpg 150w',
    'https://instagram.cdn/v1/pic_320.jpg 320w',
    'https://instagram.cdn/v1/pic_640.jpg 640w',
    'https://instagram.cdn/v1/pic_1080.jpg 1080w'
  ].join(', ');

  const candidates = parseSrcset(srcset);
  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].url, 'https://instagram.cdn/v1/pic_1080.jpg');
  assert.equal(candidates[0].width, 1080);
});

test('parseSrcset handles URLs with complex query parameters and commas', () => {
  const srcset = 'https://instagram.cdn/v/pic.jpg?stp=dst-jpg_e35,s150x150&token=abc 150w, https://instagram.cdn/v/pic.jpg?stp=dst-jpg_e35,s1080x1080&token=xyz 1080w';
  const candidates = parseSrcset(srcset);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].width, 1080);
  assert.ok(candidates[0].url.includes('s1080x1080'));
});

test('extractWidthFromUrl extracts dimension from path parameters', () => {
  assert.equal(extractWidthFromUrl('https://instagram.cdn/s1080x1080/image.jpg'), 1080);
  assert.equal(extractWidthFromUrl('https://instagram.cdn/p750x750/image.jpg'), 750);
  assert.equal(extractWidthFromUrl('https://instagram.cdn/c0.0.1440.1440/image.jpg'), 1440);
});

test('getHighestResolutionUrl picks the best candidate and falls back to src', () => {
  const imgWithSrcset = {
    getAttribute: (attr) => attr === 'srcset' ? 'https://cdn/low.jpg 320w, https://cdn/high.jpg 1080w' : null,
    src: 'https://cdn/fallback.jpg'
  };
  assert.equal(getHighestResolutionUrl(imgWithSrcset), 'https://cdn/high.jpg');

  const imgWithoutSrcset = {
    getAttribute: () => null,
    src: 'https://cdn/fallback.jpg'
  };
  assert.equal(getHighestResolutionUrl(imgWithoutSrcset), 'https://cdn/fallback.jpg');
});
