import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrcset, extractWidthFromUrl, upgradeCdnUrl, extractFromReactFiber, getHighestResolutionUrl } from '../src/utils/srcset-parser.js';

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

test('upgradeCdnUrl upgrades lower resolution dimension tokens to 1080x1080', () => {
  assert.equal(
    upgradeCdnUrl('https://instagram.cdn/v/t51/s640x640/pic.jpg'),
    'https://instagram.cdn/v/t51/s1080x1080/pic.jpg'
  );
  assert.equal(
    upgradeCdnUrl('https://instagram.cdn/v/t51/p750x750/pic.jpg'),
    'https://instagram.cdn/v/t51/p1080x1080/pic.jpg'
  );
});

test('extractFromReactFiber extracts master candidates from GraphQL image_versions2', () => {
  const fakeElement = {
    __reactProps$abc: {
      post: {
        image_versions2: {
          candidates: [
            { width: 640, height: 640, url: 'https://cdn/640.jpg' },
            { width: 1440, height: 1440, url: 'https://cdn/1440_master.jpg' },
            { width: 1080, height: 1080, url: 'https://cdn/1080.jpg' }
          ]
        }
      }
    }
  };

  const result = extractFromReactFiber(fakeElement);
  assert.ok(result);
  assert.equal(result.url, 'https://cdn/1440_master.jpg');
  assert.equal(result.width, 1440);
});

test('getHighestResolutionUrl prioritizes React fiber master candidate over srcset', () => {
  const fakeImg = {
    __reactProps$xyz: {
      media: {
        display_resources: [
          { config_width: 750, config_height: 750, src: 'https://cdn/750.jpg' },
          { config_width: 1440, config_height: 1440, src: 'https://cdn/1440_fiber.jpg' }
        ]
      }
    },
    getAttribute: () => 'https://cdn/640.jpg 640w, https://cdn/1080.jpg 1080w',
    src: 'https://cdn/fallback.jpg'
  };

  assert.equal(getHighestResolutionUrl(fakeImg), 'https://cdn/1440_fiber.jpg');
});
