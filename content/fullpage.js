// SnapCraft Advanced Full-Page Capture Engine

(async () => {
  // Prevent duplicate concurrent runs
  if (window.__snapcraft_capturing_fullpage) return;
  window.__snapcraft_capturing_fullpage = true;

  const originalScrollX = window.scrollX || window.pageXOffset || 0;
  const originalScrollY = window.scrollY || window.pageYOffset || 0;
  const originalTitle = document.title;

  // 1. Inject temporary style to:
  // - Disable smooth scroll behavior so jumps are instantaneous
  // - Hide scrollbars without modifying overflow (which breaks scrolling on many sites)
  const styleOverride = document.createElement('style');
  styleOverride.id = 'snapcraft-scroll-override';
  styleOverride.textContent = `
    html, body, * {
      scroll-behavior: auto !important;
    }
    ::-webkit-scrollbar {
      display: none !important;
      width: 0px !important;
      height: 0px !important;
      background: transparent !important;
    }
  `;
  (document.head || document.documentElement).appendChild(styleOverride);

  // 2. Create Progress HUD
  const hud = document.createElement('div');
  hud.id = 'snapcraft-fullpage-hud';
  hud.innerHTML = `
    <div class="snapcraft-hud-header">
      <div class="snapcraft-hud-title">
        <div class="snapcraft-hud-spinner"></div>
        <span>Capturing Page</span>
      </div>
      <span class="snapcraft-hud-percent" id="snapcraft-percent">0%</span>
    </div>
    <div class="snapcraft-hud-bar-bg">
      <div class="snapcraft-hud-bar-fill" id="snapcraft-bar"></div>
    </div>
  `;
  document.documentElement.appendChild(hud);

  const percentEl = document.getElementById('snapcraft-percent');
  const barEl = document.getElementById('snapcraft-bar');

  // 3. Smart Sticky Header Detection
  // ONLY hide small top navbars, NEVER hide page backgrounds or root wrappers!
  const hiddenStickyElements = [];

  function hideStickyHeaders() {
    const candidateTags = document.querySelectorAll('header, nav, [role="banner"], [class*="header"], [class*="navbar"], [class*="nav-bar"], [id*="header"], [id*="nav"]');
    for (const el of candidateTags) {
      if (el === hud || hud.contains(el)) continue;

      const style = window.getComputedStyle(el);
      const pos = style.position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;

      const rect = el.getBoundingClientRect();
      // Must be docked near top
      const isNearTop = rect.top >= -10 && rect.top <= 25;
      // Must have reasonable header height (< 160px and < 25% of viewport)
      const isHeaderHeight = rect.height > 15 && rect.height <= Math.min(160, window.innerHeight * 0.25);
      // Must not be a full-width background or layout container
      if (rect.height >= window.innerHeight * 0.35) continue;
      if (rect.width >= window.innerWidth * 0.95 && rect.height >= window.innerHeight * 0.75) continue;

      if (isNearTop && isHeaderHeight && el.style.visibility !== 'hidden') {
        hiddenStickyElements.push({ el, origVisibility: el.style.visibility });
        el.style.visibility = 'hidden';
      }
    }
  }

  function restoreStickyHeaders() {
    for (const item of hiddenStickyElements) {
      item.el.style.visibility = item.origVisibility;
    }
    hiddenStickyElements.length = 0;
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Wait for compositor repaint & tiles
  function waitForRepaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 140);
        });
      });
    });
  }

  function cleanup() {
    restoreStickyHeaders();
    if (styleOverride.parentNode) {
      styleOverride.parentNode.removeChild(styleOverride);
    }
    if (hud.parentNode) {
      hud.parentNode.removeChild(hud);
    }
    document.title = originalTitle;
    window.scrollTo({ top: originalScrollX, left: originalScrollY, behavior: 'instant' });
    chrome.runtime.sendMessage({ action: 'CLEAR_BADGE' });
    window.__snapcraft_capturing_fullpage = false;
  }

  try {
    // Determine scrollable element
    const scrollEl = document.scrollingElement || document.documentElement || document.body;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    // Measure total document dimensions
    let totalWidth = Math.max(
      scrollEl.scrollWidth,
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
      viewportWidth
    );

    let totalHeight = Math.max(
      scrollEl.scrollHeight,
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
      viewportHeight
    );

    const slices = [];
    let currentY = 0;
    const MAX_SLICES = 45;
    let isFinished = false;

    // Scroll to top to begin
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    while (!isFinished && slices.length < MAX_SLICES) {
      const actualY = window.scrollY || window.pageYOffset || 0;
      const progress = Math.min(100, Math.round(((actualY + viewportHeight) / totalHeight) * 100));

      // 1. Update Tab title (completely outside webpage, impossible to capture)
      document.title = `📸 [${progress}%] Capturing...`;

      // 2. Update HUD values
      if (percentEl) percentEl.textContent = `${progress}%`;
      if (barEl) barEl.style.width = `${progress}%`;

      // 3. FORCEFULLY HIDE HUD BEFORE REPAINTING
      hud.style.display = 'none';
      hud.style.visibility = 'hidden';
      hud.style.opacity = '0';

      // 4. WAIT FOR COMPOSITOR TO REPAINT CLEAN FRAME WITHOUT HUD
      await waitForRepaint();

      // 5. CAPTURE CLEAN VIEWPORT SLICE
      const response = await chrome.runtime.sendMessage({
        action: 'CAPTURE_SLICE',
        progress: progress
      });

      if (response && response.dataUrl) {
        slices.push({
          dataUrl: response.dataUrl,
          scrollY: actualY,
          targetY: currentY,
          viewportWidth: viewportWidth,
          viewportHeight: viewportHeight
        });
      }

      // Hide sticky headers after the very first slice
      if (slices.length === 1) {
        hideStickyHeaders();
      }

      // Update totalHeight dynamically if page grew from lazy loading
      const currentScrollHeight = Math.max(
        scrollEl.scrollHeight,
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      if (currentScrollHeight > totalHeight) {
        totalHeight = currentScrollHeight;
      }

      // Check termination conditions
      const maxScrollY = Math.max(0, totalHeight - viewportHeight);
      if (actualY >= maxScrollY || currentY + viewportHeight >= totalHeight) {
        isFinished = true;
      } else {
        // Advance scroll target
        currentY += viewportHeight;
        if (currentY > maxScrollY) {
          currentY = maxScrollY;
        }

        // Show HUD momentarily during scroll transition
        hud.style.display = 'flex';
        hud.style.visibility = 'visible';
        hud.style.opacity = '1';

        window.scrollTo({ top: currentY, left: 0, behavior: 'instant' });
        await delay(60);
      }
    }

    // Cleanup and send slices
    cleanup();

    await chrome.runtime.sendMessage({
      action: 'FINISH_FULL_PAGE',
      totalWidth,
      totalHeight,
      dpr,
      slices
    });

  } catch (err) {
    console.error('SnapCraft Full-Page error:', err);
    cleanup();
  }
})();
