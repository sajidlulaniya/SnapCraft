// SnapCraft Background Service Worker

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Generate unique session ID
function generateSessionId() {
  return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Open Editor Tab with captured session data
async function openEditor(sessionId) {
  const editorUrl = chrome.runtime.getURL(`editor/editor.html?id=${sessionId}`);
  await chrome.tabs.create({ url: editorUrl });
}

// Clean up old session keys (keep only recent)
async function cleanOldSessions() {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all);
    const now = Date.now();
    const toRemove = [];

    for (const key of keys) {
      if (key.startsWith('snap_')) {
        const item = all[key];
        // Prune after 6 hours
        if (item && item.timestamp && now - item.timestamp > 6 * 60 * 60 * 1000) {
          toRemove.push(key);
        }
      }
    }
    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove);
    }
  } catch (e) {
    console.warn('SnapCraft storage cleanup error:', e);
  }
}

// Handle Capture Types
async function captureVisible(tab, delay = 0) {
  if (delay > 0) {
    await sleep(delay * 1000);
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const sessionId = generateSessionId();

  await chrome.storage.local.set({
    [sessionId]: {
      type: 'visible',
      image: dataUrl,
      title: tab.title || 'Screenshot',
      url: tab.url || '',
      timestamp: Date.now()
    }
  });

  await openEditor(sessionId);
  cleanOldSessions();
}

async function startSelectionCapture(tab, delay = 0) {
  if (delay > 0) {
    await sleep(delay * 1000);
  }

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content/selection.css']
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/selection.js']
  });
}

async function startFullPageCapture(tab, delay = 0) {
  if (delay > 0) {
    await sleep(delay * 1000);
  }

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content/fullpage.css']
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/fullpage.js']
  });
}

// Message Listener
async function startSectionCapture(tab, delay = 0) {
  if (delay > 0) await sleep(delay * 1000);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/section.js']
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tab = sender.tab;

  // Popup Triggers
  if (message.action === 'INIT_CAPTURE') {
    (async () => {
      const activeTab = await getActiveTab();
      if (!activeTab) return;

      const delay = message.delay || 0;
      if (message.mode === 'visible') {
        await captureVisible(activeTab, delay);
      } else if (message.mode === 'selection') {
        await startSelectionCapture(activeTab, delay);
      } else if (message.mode === 'full-page') {
        await startFullPageCapture(activeTab, delay);
      } else if (message.mode === 'section') {
        await startSectionCapture(activeTab, delay);
      }
    })();
    return false;
  }

  // Slice Capture for Full Page with retry logic
  if (message.action === 'CAPTURE_SLICE') {
    (async () => {
      const targetWindowId = tab ? tab.windowId : (await getActiveTab())?.windowId;
      if (!targetWindowId) {
        sendResponse({ dataUrl: null, error: 'No window found' });
        return;
      }

      // Update badge with progress percentage if provided
      if (tab && tab.id && message.progress !== undefined) {
        try {
          chrome.action.setBadgeText({ tabId: tab.id, text: `${message.progress}%` });
          chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#6366f1' });
        } catch (e) {}
      }

      let dataUrl = null;
      let lastErr = null;

      // Retry up to 4 times with cooldown to handle Chrome captureVisibleTab throttling
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          if (message.section && tab) {
            const [active] = await chrome.tabs.query({ active: true, windowId: targetWindowId });
            if (active?.id !== tab.id) throw new Error('Keep the selected tab active during section capture.');
          }
          dataUrl = await chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' });
          if (dataUrl) break;
        } catch (err) {
          lastErr = err;
          await sleep(150 * (attempt + 1));
        }
      }

      if (dataUrl) {
        sendResponse({ dataUrl });
      } else {
        console.error('CAPTURE_SLICE failed after retries:', lastErr);
        sendResponse({ dataUrl: null, error: lastErr ? lastErr.message : 'Capture failed' });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Clear badge handler
  if (message.action === 'CLEAR_BADGE') {
    if (tab && tab.id) {
      try {
        chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      } catch (e) {}
    }
    return false;
  }

  // Full Page Finished
  if (message.action === 'FINISH_SECTION') {
    (async () => {
      try {
        if (!tab || !message.image?.startsWith('data:image/png;base64,')) {
          throw new Error('Invalid section screenshot.');
        }
        const sessionId = generateSessionId();
        await chrome.storage.local.set({
          [sessionId]: {
            type: 'section', image: message.image,
            title: tab.title || 'Section Screenshot', url: tab.url || '', timestamp: Date.now()
          }
        });
        await openEditor(sessionId);
        sendResponse({ success: true });
        cleanOldSessions();
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'FINISH_FULL_PAGE') {
    (async () => {
      if (tab && tab.id) {
        try {
          chrome.action.setBadgeText({ tabId: tab.id, text: '' });
        } catch (e) {}
      }
      const sessionId = generateSessionId();
      await chrome.storage.local.set({
        [sessionId]: {
          type: 'full-page',
          slices: message.slices,
          totalWidth: message.totalWidth,
          totalHeight: message.totalHeight,
          dpr: message.dpr,
          title: tab ? tab.title : 'Full Page Screenshot',
          url: tab ? tab.url : '',
          timestamp: Date.now()
        }
      });
      await openEditor(sessionId);
      cleanOldSessions();
    })();
    return false;
  }

  // Selection Area Captured
  if (message.action === 'SELECTION_AREA_CAPTURED') {
    (async () => {
      const windowId = tab ? tab.windowId : (await getActiveTab()).windowId;
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      const sessionId = generateSessionId();

      await chrome.storage.local.set({
        [sessionId]: {
          type: 'selection',
          image: dataUrl,
          crop: message.rect,
          title: tab ? tab.title : 'Selected Screenshot',
          url: tab ? tab.url : '',
          timestamp: Date.now()
        }
      });
      await openEditor(sessionId);
      cleanOldSessions();
    })();
    return false;
  }
});

// Shortcut Commands
chrome.commands.onCommand.addListener(async (command) => {
  const activeTab = await getActiveTab();
  if (!activeTab) return;

  if (command === 'capture-visible') {
    await captureVisible(activeTab, 0);
  } else if (command === 'capture-selected') {
    await startSelectionCapture(activeTab, 0);
  } else if (command === 'capture-full-page') {
    await startFullPageCapture(activeTab, 0);
  }
});

