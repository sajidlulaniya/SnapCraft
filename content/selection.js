(() => {
  // If overlay already exists, do not duplicate
  if (document.getElementById('snapcraft-selection-overlay')) {
    return;
  }

  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let currentRect = null;

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'snapcraft-selection-overlay';

  // Instructions tooltip
  const tip = document.createElement('div');
  tip.id = 'snapcraft-selection-tip';
  tip.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
    <span>Click & drag to select region • Press <kbd style="background:rgba(255,255,255,0.2);padding:2px 5px;border-radius:3px">ESC</kbd> to cancel</span>
  `;
  overlay.appendChild(tip);

  // Selection box
  const box = document.createElement('div');
  box.id = 'snapcraft-selection-box';

  const dim = document.createElement('div');
  dim.id = 'snapcraft-selection-dim';
  box.appendChild(dim);

  const actions = document.createElement('div');
  actions.id = 'snapcraft-selection-actions';
  actions.innerHTML = `
    <button class="snapcraft-btn snapcraft-btn-cancel" id="snapcraft-btn-cancel">✕ Cancel</button>
    <button class="snapcraft-btn snapcraft-btn-confirm" id="snapcraft-btn-confirm">✓ Capture</button>
  `;
  box.appendChild(actions);

  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function commitCapture() {
    if (!currentRect || currentRect.width < 5 || currentRect.height < 5) {
      cleanup();
      return;
    }

    // Hide UI completely before screenshot
    overlay.style.display = 'none';
    overlay.style.visibility = 'hidden';

    // Wait for compositor repaint without overlay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'SELECTION_AREA_CAPTURED',
            rect: {
              x: currentRect.x,
              y: currentRect.y,
              width: currentRect.width,
              height: currentRect.height,
              dpr: window.devicePixelRatio || 1
            }
          });
          cleanup();
        }, 80);
      });
    });
  }

  function onMouseDown(e) {
    // If user clicked inside the actions toolbar, do not restart drag
    if (e.target.closest('#snapcraft-selection-actions')) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    box.style.display = 'block';
    actions.style.display = 'none';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
    dim.textContent = '0 × 0 px';
  }

  function onMouseMove(e) {
    if (!isDragging) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    currentRect = { x, y, width, height };

    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;

    dim.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    if (currentRect && currentRect.width > 15 && currentRect.height > 15) {
      actions.style.display = 'flex';
      
      // Position actions nicely if box is near bottom of viewport
      if (currentRect.y + currentRect.height + 50 > window.innerHeight) {
        actions.style.bottom = '8px';
      } else {
        actions.style.bottom = '-44px';
      }
    } else {
      box.style.display = 'none';
      currentRect = null;
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    } else if (e.key === 'Enter' && currentRect && currentRect.width > 10 && currentRect.height > 10) {
      commitCapture();
    }
  }

  overlay.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('keydown', onKeyDown);

  document.getElementById('snapcraft-btn-confirm').addEventListener('click', (e) => {
    e.stopPropagation();
    commitCapture();
  });

  document.getElementById('snapcraft-btn-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });
})();

