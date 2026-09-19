/**
 * popup.js
 * Controls settings interactions in the extension popup and syncs with chrome.storage.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  triggerMode: 'both',
  showResolutionBadge: true,
  wheelZoom: true,
  transitionStyle: 'parallax'
};

const dom = {
  toggleEnabled: document.getElementById('toggle-enabled'),
  toggleBadge: document.getElementById('toggle-badge'),
  toggleZoom: document.getElementById('toggle-zoom'),
  triggerRadios: document.querySelectorAll('input[name="triggerMode"]'),
  transitionRadios: document.querySelectorAll('input[name="transitionStyle"]')
};

async function getStorageArea() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.sync || chrome.storage.local;
  }
  return null;
}

async function loadSettings() {
  try {
    const storage = await getStorageArea();
    const stored = storage ? await storage.get(DEFAULT_SETTINGS) : DEFAULT_SETTINGS;
    const settings = { ...DEFAULT_SETTINGS, ...stored };

    dom.toggleEnabled.checked = settings.enabled;
    dom.toggleBadge.checked = settings.showResolutionBadge;
    dom.toggleZoom.checked = settings.wheelZoom;

    dom.triggerRadios.forEach(radio => {
      radio.checked = (radio.value === settings.triggerMode);
    });

    dom.transitionRadios.forEach(radio => {
      radio.checked = (radio.value === settings.transitionStyle);
    });
  } catch (err) {
    console.warn('[Immerse Popup] Failed to load settings:', err);
  }
}

async function saveSetting(key, value) {
  try {
    const storage = await getStorageArea();
    if (storage) {
      await storage.set({ [key]: value });
    }

    // Broadcast update to all active Instagram tabs
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
      for (const tab of tabs) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'SETTINGS_CHANGED',
              settings: { [key]: value }
            });
          } catch {
            // Tab might not have content script ready
          }
        }
      }
    }
  } catch (err) {
    console.error('[Immerse Popup] Failed to save setting:', err);
  }
}

function bindEvents() {
  dom.toggleEnabled.addEventListener('change', async (e) => {
    await saveSetting('enabled', e.target.checked);
  });

  dom.toggleBadge.addEventListener('change', async (e) => {
    await saveSetting('showResolutionBadge', e.target.checked);
  });

  dom.toggleZoom.addEventListener('change', async (e) => {
    await saveSetting('wheelZoom', e.target.checked);
  });

  dom.triggerRadios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await saveSetting('triggerMode', e.target.value);
      }
    });
  });

  dom.transitionRadios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
      if (e.target.checked) {
        await saveSetting('transitionStyle', e.target.value);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  bindEvents();
});
