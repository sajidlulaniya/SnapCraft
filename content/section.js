// Pick a real page section, then capture and stitch its rendered bounds.
(() => {
  if (window.__snapcraft_section || window.__snapcraft_capturing_fullpage ||
      document.getElementById('snapcraft-selection-overlay')) return;
  window.__snapcraft_section = true;

  let selected = null;
  let capturing = false;
  let cancelled = false;
  let pointer = null;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    * { box-sizing: border-box; }
    .box { position:fixed; border:2px solid #f59e0b; background:rgba(245,158,11,.08); display:none; }
    .tip { position:fixed; top:12px; left:50%; transform:translateX(-50%); max-width:90vw;
      padding:12px 18px; border-radius:10px; background:#0f172a; color:white;
      font:13px/1.5 system-ui,sans-serif; box-shadow:0 4px 20px #0005; text-align:center; }
  </style><div class="box"></div><div class="tip">Hover a section and click to capture. Up arrow: parent section. Esc: cancel.</div>`;
  document.documentElement.appendChild(host);
  const box = shadow.querySelector('.box');
  const tip = shadow.querySelector('.tip');
  const selector = 'div,section,article,main,aside,header,footer,nav,figure,table,li';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function highlight() {
    if (!selected?.isConnected) {
      box.style.display = 'none';
      return;
    }
    const rect = selected.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`
    });
    tip.textContent = `${selected.tagName.toLowerCase()}${selected.id ? '#' + selected.id : ''} · ${Math.round(rect.width)} × ${Math.round(rect.height)} px — Click to capture · ↑ Parent · Esc Cancel`;
  }

  function onMove(event) {
    if (capturing) return;
    pointer = { x: event.clientX, y: event.clientY };
    selected = document.elementFromPoint(pointer.x, pointer.y)?.closest(selector) || null;
    highlight();
  }

  function onScroll() {
    if (!capturing && pointer) onMove({ clientX: pointer.x, clientY: pointer.y });
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      stopEvent(event);
      cancelled = true;
      if (!capturing) cleanup();
    } else if (!capturing && event.key === 'ArrowUp' && selected) {
      stopEvent(event);
      selected = selected.parentElement?.closest(selector) || selected;
      highlight();
    }
  }

  function onClick(event) {
    stopEvent(event);
    if (!capturing && selected && event.button === 0) capture(selected);
  }

  function cleanup() {
    host.remove();
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('click', onClick, true);
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick']) {
      window.removeEventListener(type, stopEvent, true);
    }
    window.__snapcraft_section = false;
    chrome.runtime.sendMessage({ action: 'CLEAR_BADGE' }).catch(() => {});
  }

  async function capture(target) {
    capturing = true;
    host.style.setProperty('display', 'none', 'important');
    const originalScroll = { x: window.scrollX, y: window.scrollY };
    const saved = new Map();
    const scrollPositions = [];
    const override = document.createElement('style');
    override.textContent = `* { scroll-behavior:auto!important; scroll-snap-type:none!important;
      overflow-anchor:none!important; animation-play-state:paused!important; transition:none!important; }
      ::-webkit-scrollbar { display:none!important; }`;
    const set = (el, property, value) => {
      if (!saved.has(el)) saved.set(el, el.getAttribute('style'));
      el.style.setProperty(property, value, 'important');
    };
    const check = () => {
      if (cancelled) throw new Error('cancelled');
      if (!target.isConnected) throw new Error('The selected section was removed. Please try again.');
      if (document.hidden) throw new Error('Keep this tab active while capturing the section.');
    };
    let image;
    let failure;
    try {
      document.documentElement.appendChild(override);
      // Expand clipping/scrolling ancestors temporarily so the whole section is reachable.
      for (let el = target; el; el = el.parentElement) {
        scrollPositions.push({ el, x: el.scrollLeft, y: el.scrollTop });
        const css = getComputedStyle(el);
        if (css.position === 'fixed' || css.position === 'sticky') set(el, 'position', 'relative');
        if (el === target) {
          const borderX = parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth);
          const borderY = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
          if (el.scrollHeight > el.clientHeight && /auto|scroll|hidden/.test(css.overflowY)) {
            set(el, 'box-sizing', 'border-box');
            set(el, 'max-height', 'none');
            set(el, 'height', `${el.scrollHeight + borderY}px`);
          }
          if (el.scrollWidth > el.clientWidth && /auto|scroll|hidden/.test(css.overflowX)) {
            set(el, 'box-sizing', 'border-box');
            set(el, 'max-width', 'none');
            set(el, 'width', `${el.scrollWidth + borderX}px`);
          }
        }
        set(el, 'overflow', 'visible');
        el.scrollLeft = 0;
        el.scrollTop = 0;
      }
      // Keep external sticky bars out of the screenshot and internal sticky content in flow.
      for (const el of document.querySelectorAll('*')) {
        if (el === host || el === override || el === target || el.contains(target)) continue;
        const position = getComputedStyle(el).position;
        if (position !== 'fixed' && position !== 'sticky') continue;
        if (target.contains(el)) set(el, 'position', 'relative');
        else set(el, 'visibility', 'hidden');
      }
      await sleep(180);
      check();
      const initial = target.getBoundingClientRect();
      const width = initial.width;
      const height = initial.height;
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      if (!width || !height || canvas.width > 32767 || canvas.height > 32767 ||
          canvas.width * canvas.height > 64000000) {
        throw new Error('This section is too large. Select a smaller section.');
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create the screenshot canvas.');
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const columns = Math.ceil(width / viewportWidth);
      const rows = Math.ceil(height / viewportHeight);
      if (rows * columns > 100) throw new Error('This section is too large. Select a smaller section.');

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          check();
          const x = column * viewportWidth;
          const y = row * viewportHeight;
          const rect = target.getBoundingClientRect();
          window.scrollTo({ left: window.scrollX + rect.left + x,
            top: window.scrollY + rect.top + y, behavior: 'instant' });
          // Stay below Chrome's capture rate limit, including consecutive captures.
          await sleep(550);
          check();
          const current = target.getBoundingClientRect();
          if (Math.abs(current.width - width) > 1 || Math.abs(current.height - height) > 1 ||
              window.innerWidth !== viewportWidth || window.innerHeight !== viewportHeight) {
            throw new Error('The section changed size during capture. Please try again once it has loaded.');
          }
          const sx = current.left + x;
          const sy = current.top + y;
          const w = Math.min(viewportWidth, width - x);
          const h = Math.min(viewportHeight, height - y);
          if (sx < -1 || sy < -1 || sx + w > viewportWidth + 1 || sy + h > viewportHeight + 1) {
            throw new Error('This section cannot be fully scrolled into view. Select a smaller section.');
          }
          const result = await chrome.runtime.sendMessage({ action: 'CAPTURE_SLICE', section: true,
            progress: Math.round((row * columns + column + 1) / (rows * columns) * 100) });
          check();
          if (!result?.dataUrl) throw new Error(result?.error || 'Section capture failed.');
          const bitmap = new Image();
          bitmap.src = result.dataUrl;
          await bitmap.decode();
          const scaleX = bitmap.naturalWidth / viewportWidth;
          const scaleY = bitmap.naturalHeight / viewportHeight;
          const dx = Math.round(x * dpr);
          const dy = Math.round(y * dpr);
          ctx.drawImage(bitmap, Math.max(0, sx) * scaleX, Math.max(0, sy) * scaleY,
            w * scaleX, h * scaleY, dx, dy,
            Math.round((x + w) * dpr) - dx, Math.round((y + h) * dpr) - dy);
        }
      }
      image = canvas.toDataURL('image/png');
      if (!image.startsWith('data:image/png')) throw new Error('Unable to export this section.');
    } catch (error) {
      failure = error;
    } finally {
      for (const [el, style] of saved) {
        if (style === null) el.removeAttribute('style');
        else el.setAttribute('style', style);
      }
      for (const { el, x, y } of scrollPositions.reverse()) {
        el.scrollLeft = x;
        el.scrollTop = y;
      }
      window.scrollTo({ left: originalScroll.x, top: originalScroll.y, behavior: 'instant' });
      // Chromium can recreate an empty style attribute while restoring scroll offsets.
      for (const [el, style] of saved) {
        if (style === null && el.getAttribute('style') === '') el.removeAttribute('style');
      }
      override.remove();
      cleanup();
    }
    if (cancelled) return;
    if (!failure) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'FINISH_SECTION', image });
        if (!response?.success) throw new Error(response?.error || 'Unable to open the screenshot editor.');
      } catch (error) { failure = error; }
    }
    if (failure) {
      console.error('SnapCraft section capture:', failure);
      alert(`SnapCraft: ${failure.message}`);
    }
  }

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('click', onClick, true);
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick']) {
    window.addEventListener(type, stopEvent, true);
  }
})();
