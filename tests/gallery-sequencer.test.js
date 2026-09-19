import test from 'node:test';
import assert from 'node:assert/strict';
import { GallerySequencer } from '../src/modules/gallery-sequencer.js';

test('GallerySequencer accumulates and preserves posts across DOM recycling', () => {
  const sequencer = new GallerySequencer();

  // Mock post 1 in DOM
  const mockTile1 = {
    matches: (sel) => sel.includes('/p/'),
    getAttribute: () => '/p/POST1/',
    querySelector: () => null,
    getBoundingClientRect: () => ({ top: 100, left: 0 }),
    contains: () => false
  };
  const mockImg1 = {
    tagName: 'IMG',
    src: 'https://instagram.fna.fbcdn.net/v/t51.2885-15/post1.jpg?_nc_cat=101',
    currentSrc: 'https://instagram.fna.fbcdn.net/v/t51.2885-15/post1.jpg?_nc_cat=101',
    closest: (sel) => sel.includes('/p/') ? mockTile1 : null
  };
  mockTile1.querySelectorAll = (sel) => sel.includes('img') ? [mockImg1] : [];

  // First batch: Post 1 visible
  const posts1 = sequencer.syncSequence([{ img: mockImg1, container: mockTile1 }]);
  assert.equal(posts1.length, 1);
  assert.equal(posts1[0].id, 'post_POST1');

  // Mock post 2 in DOM while Post 1 is unmounted by Instagram virtual feed
  const mockTile2 = {
    matches: (sel) => sel.includes('/p/'),
    getAttribute: () => '/p/POST2/',
    querySelector: () => null,
    getBoundingClientRect: () => ({ top: 500, left: 0 }),
    contains: () => false
  };
  const mockImg2 = {
    tagName: 'IMG',
    src: 'https://instagram.fna.fbcdn.net/v/t51.2885-15/post2.jpg?_nc_cat=102',
    currentSrc: 'https://instagram.fna.fbcdn.net/v/t51.2885-15/post2.jpg?_nc_cat=102',
    closest: (sel) => sel.includes('/p/') ? mockTile2 : null
  };
  mockTile2.querySelectorAll = (sel) => sel.includes('img') ? [mockImg2] : [];

  // Second batch: Only Post 2 currently in DOM (Post 1 was recycled off-screen)
  const posts2 = sequencer.syncSequence([{ img: mockImg2, container: mockTile2 }]);

  // Must retain BOTH Post 1 and Post 2!
  assert.equal(posts2.length, 2);
  assert.equal(posts2[0].id, 'post_POST1');
  assert.equal(posts2[1].id, 'post_POST2');
  assert.equal(posts2[0].slides[0].url, 'https://instagram.fna.fbcdn.net/v/t51.2885-15/post1.jpg?_nc_cat=101');
});
