# Immerse — Instagram High-Res Fullscreen Viewer

A lightweight, non-intrusive browser extension (Manifest V3) that simulates large-screen viewing on Instagram by extracting the highest possible resolution images (`srcset` 1080p+ candidates) and presenting them in an intuitive, distraction-free fullscreen lightbox.

---

## ✨ Features

- **Non-Intrusive Integration**: Preserves Instagram's native feed layout, styling, and functionality without forced page reflows.
- **Liquid Glass Design Language**: Ultra-modern refractive glassmorphism with specular inner highlights, optical blur (`backdrop-filter: blur(24px)`), atmospheric glow, and spring physics transitions.
- **Tile-Wide Hover Activation**: The `HD` button smoothly appears when hovering anywhere across the image tile (grid item, explore card, or feed post), not just near the corner.
- **Multi-Tier Resolution Engine**: Inspects React Fiber GraphQL models (`image_versions2.candidates`, `display_resources`), parses `srcset` descriptors, and upgrades CDN tokens to guarantee the absolute highest resolution available (up to 1440px master assets).
- **Desktop-Style Grid Navigation**: Browse through all images on the page sequentially with `←` / `→` arrow keys, exactly like navigating through photos in a desktop folder (Windows Photos / macOS Preview).
- **Intuitive Fullscreen Lightbox**:
  - **Pan & Zoom**: Smooth mouse wheel zooming anchored to the cursor position (0.5× to 6×) and grab-to-pan when inspecting details.
  - **Double Click**: Quick toggle between 100% fit and 2.5× zoom.
  - **Auto-Hiding Controls**: Controls gently fade out when idle (after 3.2s) for an unobscured view, reappearing instantly on mouse movement.
  - **Resolution Badge**: Live readout of the loaded image's actual pixel dimensions with pulsing green HD indicator.
  - **Copyright Protection & Anti-Download Shielding**: Actively respects creator copyrights by preventing right-click "Save As", disabling drag-and-drop extraction, blocking save keyboard shortcuts (Ctrl+S / Cmd+S), and shielding images behind a non-interactive layer.
  - **True Fullscreen**: Toggle native browser fullscreen (`F`).
- **Customizable Settings Popup**: Toggle features, select slide transition style (Parallax vs Flat), toggle wheel zoom, and adjust preferences.

---

## ⌨️ Keyboard Shortcuts (in Fullscreen View)

| Key | Action |
| --- | --- |
| `Esc` | Close fullscreen viewer |
| `←` / `→` (or `J` / `L`) | Previous / Next Post in Grid |
| `↑` / `↓` (or `[` / `]`) | Previous / Next Carousel Slide in current post |
| `Click Slide Dots` | Jump directly to carousel slide |
| `F` | Toggle true fullscreen mode |
| `0` | Reset zoom and pan |
| `+` / `-` | Zoom in / Zoom out |
| `Scroll` | Smooth zoom towards mouse pointer |
| `Drag` | Pan around zoomed image |
| `Double Click` | Toggle 100% fit / 2.5× zoom |

---

## 🏗️ Architecture & Separation of Concerns

```
D:/Immerse/
├── manifest.json              # Manifest V3 configuration & permissions
├── package.json               # Node.js project manifest & scripts
├── icons/                     # Extension icons (16px, 48px, 128px)
├── popup/
│   ├── popup.html             # Extension settings modal markup
│   ├── popup.css              # Dark-mode settings styling
│   └── popup.js               # Settings sync & chrome.storage communication
├── src/
│   ├── content.js             # Main orchestrator (ties modules together)
│   ├── utils/
│   │   ├── srcset-parser.js   # Pure parser for srcset & Instagram CDN candidates
│   │   └── dom-helpers.js     # DOM creation, batching & tree traversal
│   ├── modules/
│   │   ├── settings-store.js  # Reactive settings store backed by chrome.storage
│   │   ├── viewer-overlay.js  # Fullscreen lightbox overlay component (pan/zoom/controls)
│   │   ├── hover-button.js    # Non-intrusive floating HD button manager
│   │   └── media-detector.js  # Batched MutationObserver for feed, grid, & carousels
│   └── styles/
│       ├── overlay.css        # Lightbox backdrop blur & control styles
│       └── hover-button.css   # Translucent hover button styles
├── dist/                      # Ready-to-load bundled assets
│   ├── content.js             # Bundled content script
│   └── content.css            # Bundled styles
├── tests/
│   └── srcset-parser.test.js  # Unit tests using Node test runner
└── scripts/
    ├── build.js               # Bundler script
    └── generate-icons.js      # Icon generator script
```

---

## 🚀 How to Install in Chrome / Edge / Brave

1. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `D:\Immerse` folder.
5. Navigate to [Instagram](https://www.instagram.com) and hover over any post to see the `HD` button appear!

---

## 🧪 Development & Testing

- **Run unit tests**:
  ```bash
  node --test tests/srcset-parser.test.js
  ```
- **Rebuild bundle**:
  ```bash
  node scripts/build.js
  ```
- **Regenerate icons**:
  ```bash
  node scripts/generate-icons.js
  ```
