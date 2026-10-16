// SnapCraft Annotation Editor Engine

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const canvasViewport = document.getElementById('canvas-viewport');
  const canvasContainer = document.getElementById('canvas-container');
  const canvas = document.getElementById('main-canvas');
  const ctx = canvas.getContext('2d');

  const filenameInput = document.getElementById('filename-input');
  const badgeDimensions = document.getElementById('badge-dimensions');
  const zoomLevelText = document.getElementById('zoom-level-text');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomFit = document.getElementById('btn-zoom-fit');
  const btnZoom100 = document.getElementById('btn-zoom-100');

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnReset = document.getElementById('btn-reset');

  const btnCopy = document.getElementById('btn-copy');
  const btnDownloadPng = document.getElementById('btn-download-png');
  const btnDownloadJpg = document.getElementById('btn-download-jpg');
  const btnDownloadMore = document.getElementById('btn-download-more');
  const downloadMenu = document.getElementById('download-menu');

  const toolButtons = document.querySelectorAll('.tool-btn');
  const propertiesBar = document.getElementById('properties-bar');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const customColorInput = document.getElementById('custom-color-input');
  const sizeButtons = document.querySelectorAll('.size-btn');
  const fillButtons = document.querySelectorAll('.fill-btn');
  const fontSizeSelect = document.getElementById('font-size-select');
  const fontSizeGroup = document.getElementById('font-size-group');
  const strokeWidthGroup = document.getElementById('stroke-width-group');
  const fillStyleGroup = document.getElementById('fill-style-group');
  const deleteSelectedGroup = document.getElementById('delete-selected-group');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');

  const cropOverlay = document.getElementById('crop-overlay');
  const cropBox = document.getElementById('crop-box');
  const cropActionsBanner = document.getElementById('crop-actions-banner');
  const cropDimText = document.getElementById('crop-dim-text');
  const btnCropApply = document.getElementById('btn-crop-apply');
  const btnCropCancel = document.getElementById('btn-crop-cancel');

  const toast = document.getElementById('toast');

  // Application State
  let baseCanvas = document.createElement('canvas'); // stores base image
  let baseCtx = baseCanvas.getContext('2d');
  let originalBaseCanvas = document.createElement('canvas'); // for reset

  let currentTool = 'select'; // select, crop, pen, highlighter, arrow, line, rect, circle, text, blur, step
  let currentColor = '#ef4444';
  let currentStrokeWidth = 4;
  let currentFillStyle = 'none'; // none, semi, solid
  let currentFontSize = 22;

  let zoomScale = 1.0;
  let annotations = [];
  let selectedAnnotation = null;
  let stepCounter = 1;

  // History stacks
  const undoStack = [];
  const redoStack = [];

  // Interaction State
  let isMouseDown = false;
  let isSpacePressed = false;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let startX = 0;
  let startY = 0;
  let currentAction = null; // drawing active object
  let isMovingSelected = false;
  let moveOffset = { x: 0, y: 0 };

  // Crop State
  let cropState = {
    active: false,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    isDragging: false,
    dragHandle: null,
    startX: 0,
    startY: 0
  };

  // Helper: Show Toast
  let toastTimer = null;
  function showToast(message, duration = 2500) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.opacity = '1';
    toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.classList.add('hidden'), 250);
    }, duration);
  }

  // Helper: Deep Clone
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Push State to Undo
  function pushState() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = baseCanvas.width;
    tempCanvas.height = baseCanvas.height;
    tempCanvas.getContext('2d').drawImage(baseCanvas, 0, 0);

    undoStack.push({
      baseCanvasSnapshot: tempCanvas,
      annotations: deepClone(annotations),
      stepCounter
    });
    // Clear redo
    redoStack.length = 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    btnUndo.disabled = undoStack.length === 0;
    btnRedo.disabled = redoStack.length === 0;
  }

  // Load Image into Base Canvas
  function loadBaseImage(img, cropRect = null) {
    if (cropRect) {
      const dpr = cropRect.dpr || 1;
      const cropX = Math.round(cropRect.x * dpr);
      const cropY = Math.round(cropRect.y * dpr);
      const cropW = Math.round(cropRect.width * dpr);
      const cropH = Math.round(cropRect.height * dpr);

      baseCanvas.width = cropW;
      baseCanvas.height = cropH;
      baseCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    } else {
      baseCanvas.width = img.width;
      baseCanvas.height = img.height;
      baseCtx.drawImage(img, 0, 0);
    }

    // Save copy for reset
    originalBaseCanvas.width = baseCanvas.width;
    originalBaseCanvas.height = baseCanvas.height;
    originalBaseCanvas.getContext('2d').drawImage(baseCanvas, 0, 0);

    syncCanvasSize();
    fitToScreen();
    render();
  }

  // Sync canvas size with baseCanvas
  function syncCanvasSize() {
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;
    badgeDimensions.textContent = `${baseCanvas.width} × ${baseCanvas.height} px`;
  }

  // Load Session Data
  async function initSession() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('id');

    if (!sessionId) {
      showToast('No screenshot session specified.');
      return;
    }

    try {
      const result = await chrome.storage.local.get(sessionId);
      const session = result[sessionId];

      if (!session) {
        showToast('Screenshot data not found.');
        return;
      }

      // Generate initial filename
      const titleSlug = (session.title || 'Screenshot')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 30);
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      filenameInput.value = `${titleSlug}_${dateStr}.png`;

      if (session.type === 'visible' || session.type === 'section') {
        const img = new Image();
        img.onload = () => loadBaseImage(img);
        img.src = session.image;

      } else if (session.type === 'selection') {
        const img = new Image();
        img.onload = () => loadBaseImage(img, session.crop);
        img.src = session.image;

      } else if (session.type === 'full-page') {
        showToast('Assembling full page screenshot...');
        const slices = session.slices || [];

        if (slices.length === 0) {
          showToast('No screenshot slices found.');
          return;
        }

        // 1. Load all slice images
        const loadedSlices = await Promise.all(
          slices.map((slice, index) => {
            return new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ img, slice, index });
              img.onerror = () => resolve(null);
              img.src = slice.dataUrl;
            });
          })
        );

        const validSlices = loadedSlices.filter(Boolean);
        if (validSlices.length === 0) {
          showToast('Failed to load captured slices.');
          return;
        }

        // 2. Measure actual scale and dimensions from the first slice
        const firstImg = validSlices[0].img;
        const firstSlice = validSlices[0].slice;
        const canvasWidth = firstImg.naturalWidth;
        const scaleFactor = canvasWidth / firstSlice.viewportWidth;

        // 3. Calculate total needed canvas height by calculating cumulative non-overlapping coverage
        let highestCoveredY = firstSlice.viewportHeight;

        for (let i = 1; i < validSlices.length; i++) {
          const { slice } = validSlices[i];
          const sliceBottomY = slice.scrollY + slice.viewportHeight;
          if (sliceBottomY > highestCoveredY) {
            highestCoveredY = sliceBottomY;
          }
        }

        // Cap to safe browser limit (max 16384px) to prevent GPU canvas crashing
        const totalCalculatedHeight = Math.min(16384, Math.round(highestCoveredY * scaleFactor));

        baseCanvas.width = canvasWidth;
        baseCanvas.height = totalCalculatedHeight;
        baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);

        // 4. Stitch each slice seamlessly without overwriting
        let currentCoveredY = 0;

        for (let i = 0; i < validSlices.length; i++) {
          const { img, slice } = validSlices[i];

          if (i === 0) {
            // First slice: Draw completely from top
            const drawH = Math.min(img.naturalHeight, baseCanvas.height);
            baseCtx.drawImage(
              img,
              0, 0, img.naturalWidth, drawH,
              0, 0, canvasWidth, drawH
            );
            currentCoveredY = slice.viewportHeight;
          } else {
            // Subsequent slices: Only take the NEW uncovered bottom portion
            const sliceBottomY = slice.scrollY + slice.viewportHeight;
            const newHeightCSS = sliceBottomY - currentCoveredY;

            if (newHeightCSS > 0) {
              const offsetInSliceCSS = currentCoveredY - slice.scrollY;
              const sourceY = Math.max(0, Math.round(offsetInSliceCSS * scaleFactor));
              const sourceH = Math.min(
                img.naturalHeight - sourceY,
                Math.round(newHeightCSS * scaleFactor)
              );

              const destY = Math.round(currentCoveredY * scaleFactor);
              const destH = Math.min(sourceH, baseCanvas.height - destY);

              if (destH > 0 && sourceH > 0) {
                baseCtx.drawImage(
                  img,
                  0, sourceY, img.naturalWidth, sourceH,
                  0, destY, canvasWidth, destH
                );
              }

              currentCoveredY = sliceBottomY;
            }
          }
        }

        // 5. If actual content drawn is slightly less than totalCalculatedHeight, trim canvas
        const finalActualHeight = Math.min(baseCanvas.height, Math.round(currentCoveredY * scaleFactor));
        if (finalActualHeight < baseCanvas.height && finalActualHeight > 50) {
          const trimmedCanvas = document.createElement('canvas');
          trimmedCanvas.width = canvasWidth;
          trimmedCanvas.height = finalActualHeight;
          trimmedCanvas.getContext('2d').drawImage(
            baseCanvas,
            0, 0, canvasWidth, finalActualHeight,
            0, 0, canvasWidth, finalActualHeight
          );
          baseCanvas.width = canvasWidth;
          baseCanvas.height = finalActualHeight;
          baseCtx.drawImage(trimmedCanvas, 0, 0);
        }

        originalBaseCanvas.width = baseCanvas.width;
        originalBaseCanvas.height = baseCanvas.height;
        originalBaseCanvas.getContext('2d').drawImage(baseCanvas, 0, 0);

        syncCanvasSize();
        fitToScreen();
        render();
        showToast(`Full page assembled seamlessly (${baseCanvas.width} × ${baseCanvas.height} px)`, 2500);
      }
    } catch (err) {
      console.error('Session loading error:', err);
      showToast('Error loading screenshot.');
    }
  }

  // Zoom Handling
  function setZoom(newZoom) {
    zoomScale = Math.min(4.0, Math.max(0.15, newZoom));
    canvasContainer.style.transform = `scale(${zoomScale})`;
    zoomLevelText.textContent = `${Math.round(zoomScale * 100)}%`;
  }

  function fitToScreen() {
    const pad = 120;
    const viewW = canvasViewport.clientWidth - pad;
    const viewH = canvasViewport.clientHeight - pad;
    if (viewW <= 0 || viewH <= 0 || baseCanvas.width === 0) return;

    const scaleW = viewW / baseCanvas.width;
    const scaleH = viewH / baseCanvas.height;
    const fitScale = Math.min(scaleW, scaleH, 1.0);
    setZoom(fitScale);
  }

  btnZoomIn.addEventListener('click', () => setZoom(zoomScale + 0.15));
  btnZoomOut.addEventListener('click', () => setZoom(zoomScale - 0.15));
  btnZoom100.addEventListener('click', () => setZoom(1.0));
  btnZoomFit.addEventListener('click', fitToScreen);

  // Undo / Redo
  function undo() {
    if (undoStack.length === 0) return;

    const currentCanvasSnap = document.createElement('canvas');
    currentCanvasSnap.width = baseCanvas.width;
    currentCanvasSnap.height = baseCanvas.height;
    currentCanvasSnap.getContext('2d').drawImage(baseCanvas, 0, 0);

    redoStack.push({
      baseCanvasSnapshot: currentCanvasSnap,
      annotations: deepClone(annotations),
      stepCounter
    });

    const prevState = undoStack.pop();
    baseCanvas.width = prevState.baseCanvasSnapshot.width;
    baseCanvas.height = prevState.baseCanvasSnapshot.height;
    baseCtx.drawImage(prevState.baseCanvasSnapshot, 0, 0);

    annotations = prevState.annotations;
    stepCounter = prevState.stepCounter;
    selectedAnnotation = null;

    syncCanvasSize();
    updateHistoryButtons();
    render();
  }

  function redo() {
    if (redoStack.length === 0) return;

    const currentCanvasSnap = document.createElement('canvas');
    currentCanvasSnap.width = baseCanvas.width;
    currentCanvasSnap.height = baseCanvas.height;
    currentCanvasSnap.getContext('2d').drawImage(baseCanvas, 0, 0);

    undoStack.push({
      baseCanvasSnapshot: currentCanvasSnap,
      annotations: deepClone(annotations),
      stepCounter
    });

    const nextState = redoStack.pop();
    baseCanvas.width = nextState.baseCanvasSnapshot.width;
    baseCanvas.height = nextState.baseCanvasSnapshot.height;
    baseCtx.drawImage(nextState.baseCanvasSnapshot, 0, 0);

    annotations = nextState.annotations;
    stepCounter = nextState.stepCounter;
    selectedAnnotation = null;

    syncCanvasSize();
    updateHistoryButtons();
    render();
  }

  function resetAll() {
    if (confirm('Are you sure you want to reset all edits and annotations?')) {
      pushState();
      baseCanvas.width = originalBaseCanvas.width;
      baseCanvas.height = originalBaseCanvas.height;
      baseCtx.drawImage(originalBaseCanvas, 0, 0);
      annotations = [];
      selectedAnnotation = null;
      stepCounter = 1;
      syncCanvasSize();
      fitToScreen();
      render();
      showToast('Reset to original screenshot.');
    }
  }

  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnReset.addEventListener('click', resetAll);

  // Tool Switching
  function selectTool(toolName) {
    if (cropState.active && toolName !== 'crop') {
      exitCropMode(false);
    }

    currentTool = toolName;
    toolButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    // Update Property visibility
    fontSizeGroup.classList.toggle('hidden', toolName !== 'text');
    fillStyleGroup.classList.toggle('hidden', !['rect', 'circle'].includes(toolName));
    strokeWidthGroup.classList.toggle('hidden', ['text', 'blur', 'step'].includes(toolName));

    if (toolName !== 'select') {
      selectedAnnotation = null;
      deleteSelectedGroup.classList.add('hidden');
    }

    // Set cursor
    if (toolName === 'select') {
      canvas.style.cursor = 'default';
    } else if (toolName === 'crop') {
      canvas.style.cursor = 'crosshair';
      enterCropMode();
    } else if (toolName === 'text') {
      canvas.style.cursor = 'text';
    } else {
      canvas.style.cursor = 'crosshair';
    }

    render();
  }

  toolButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  // Color Swatches
  colorSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      currentColor = swatch.dataset.color;
      if (selectedAnnotation) {
        pushState();
        if (selectedAnnotation.type === 'step') {
          selectedAnnotation.color = currentColor;
        } else {
          selectedAnnotation.color = currentColor;
          if (selectedAnnotation.strokeColor) selectedAnnotation.strokeColor = currentColor;
        }
        render();
      }
    });
  });

  customColorInput.addEventListener('input', (e) => {
    currentColor = e.target.value;
    colorSwatches.forEach((s) => s.classList.remove('active'));
    if (selectedAnnotation) {
      pushState();
      selectedAnnotation.color = currentColor;
      if (selectedAnnotation.strokeColor) selectedAnnotation.strokeColor = currentColor;
      render();
    }
  });

  // Stroke Size
  sizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      sizeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentStrokeWidth = parseInt(btn.dataset.size, 10);
      if (selectedAnnotation && selectedAnnotation.width) {
        pushState();
        selectedAnnotation.width = currentStrokeWidth;
        if (selectedAnnotation.strokeWidth) selectedAnnotation.strokeWidth = currentStrokeWidth;
        render();
      }
    });
  });

  // Fill Style
  fillButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      fillButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFillStyle = btn.dataset.fill;
      if (selectedAnnotation && ['rect', 'circle'].includes(selectedAnnotation.type)) {
        pushState();
        selectedAnnotation.fillStyle = currentFillStyle;
        render();
      }
    });
  });

  // Font Size
  fontSizeSelect.addEventListener('change', (e) => {
    currentFontSize = parseInt(e.target.value, 10);
    if (selectedAnnotation && selectedAnnotation.type === 'text') {
      pushState();
      selectedAnnotation.fontSize = currentFontSize;
      render();
    }
  });

  // Delete Selected Annotation
  btnDeleteSelected.addEventListener('click', () => {
    if (selectedAnnotation) {
      pushState();
      annotations = annotations.filter((a) => a !== selectedAnnotation);
      selectedAnnotation = null;
      deleteSelectedGroup.classList.add('hidden');
      render();
      showToast('Annotation removed.');
    }
  });

  // Crop Mode Implementation
  function enterCropMode() {
    cropState.active = true;
    cropOverlay.classList.remove('hidden');
    cropActionsBanner.classList.remove('hidden');
    propertiesBar.classList.add('hidden');

    // Default crop box = inset 10% from edges
    const padX = Math.round(baseCanvas.width * 0.08);
    const padY = Math.round(baseCanvas.height * 0.08);
    cropState.x = padX;
    cropState.y = padY;
    cropState.w = baseCanvas.width - padX * 2;
    cropState.h = baseCanvas.height - padY * 2;

    updateCropBoxDOM();
  }

  function updateCropBoxDOM() {
    cropBox.style.left = `${cropState.x}px`;
    cropBox.style.top = `${cropState.y}px`;
    cropBox.style.width = `${cropState.w}px`;
    cropBox.style.height = `${cropState.h}px`;
    cropDimText.textContent = `${Math.round(cropState.w)} × ${Math.round(cropState.h)} px`;
  }

  function exitCropMode(apply = false) {
    if (apply && cropState.w > 20 && cropState.h > 20) {
      pushState();

      const cropX = Math.round(cropState.x);
      const cropY = Math.round(cropState.y);
      const cropW = Math.round(cropState.w);
      const cropH = Math.round(cropState.h);

      // Create cropped base canvas
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      croppedCanvas.getContext('2d').drawImage(
        baseCanvas,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      baseCanvas.width = cropW;
      baseCanvas.height = cropH;
      baseCtx.drawImage(croppedCanvas, 0, 0);

      // Adjust annotations
      annotations.forEach((item) => {
        if (item.type === 'pen' || item.type === 'highlighter') {
          item.points.forEach((pt) => { pt.x -= cropX; pt.y -= cropY; });
        } else if (item.type === 'arrow' || item.type === 'line') {
          item.x1 -= cropX; item.y1 -= cropY;
          item.x2 -= cropX; item.y2 -= cropY;
        } else if (item.type === 'circle') {
          item.cx -= cropX; item.cy -= cropY;
        } else {
          item.x -= cropX; item.y -= cropY;
        }
      });

      syncCanvasSize();
      fitToScreen();
      showToast(`Cropped to ${cropW} × ${cropH} px`);
    }

    cropState.active = false;
    cropOverlay.classList.add('hidden');
    cropActionsBanner.classList.add('hidden');
    propertiesBar.classList.remove('hidden');
    selectTool('select');
  }

  btnCropApply.addEventListener('click', () => exitCropMode(true));
  btnCropCancel.addEventListener('click', () => exitCropMode(false));

  // Handle Crop Box Drag & Resize
  cropBox.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    cropState.isDragging = true;
    cropState.dragHandle = e.target.classList.contains('crop-handle')
      ? Array.from(e.target.classList).find(c => c !== 'crop-handle')
      : 'box';
    cropState.startX = e.clientX;
    cropState.startY = e.clientY;
    cropState.origX = cropState.x;
    cropState.origY = cropState.y;
    cropState.origW = cropState.w;
    cropState.origH = cropState.h;
  });

  window.addEventListener('mousemove', (e) => {
    if (!cropState.isDragging) return;

    const dx = (e.clientX - cropState.startX) / zoomScale;
    const dy = (e.clientY - cropState.startY) / zoomScale;

    if (cropState.dragHandle === 'box') {
      cropState.x = Math.max(0, Math.min(baseCanvas.width - cropState.w, cropState.origX + dx));
      cropState.y = Math.max(0, Math.min(baseCanvas.height - cropState.h, cropState.origY + dy));
    } else {
      let newX = cropState.origX;
      let newY = cropState.origY;
      let newW = cropState.origW;
      let newH = cropState.origH;

      if (cropState.dragHandle.includes('e')) newW = Math.max(30, cropState.origW + dx);
      if (cropState.dragHandle.includes('s')) newH = Math.max(30, cropState.origH + dy);
      if (cropState.dragHandle.includes('w')) {
        const potentialW = cropState.origW - dx;
        if (potentialW >= 30) {
          newX = cropState.origX + dx;
          newW = potentialW;
        }
      }
      if (cropState.dragHandle.includes('n')) {
        const potentialH = cropState.origH - dy;
        if (potentialH >= 30) {
          newY = cropState.origY + dy;
          newH = potentialH;
        }
      }

      // Stay within bounds
      cropState.x = Math.max(0, newX);
      cropState.y = Math.max(0, newY);
      cropState.w = Math.min(baseCanvas.width - cropState.x, newW);
      cropState.h = Math.min(baseCanvas.height - cropState.y, newH);
    }

    updateCropBoxDOM();
  });

  window.addEventListener('mouseup', () => {
    if (cropState.isDragging) {
      cropState.isDragging = false;
      cropState.dragHandle = null;
    }
  });

  // Coordinate Helper: Get Canvas Relative Coords
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  // Hit Test: Check which annotation was clicked
  function hitTest(x, y) {
    // Check in reverse order (topmost first)
    for (let i = annotations.length - 1; i >= 0; i--) {
      const a = annotations[i];
      if (a.type === 'rect' || a.type === 'blur') {
        if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
      } else if (a.type === 'circle') {
        const dx = (x - a.cx) / a.rx;
        const dy = (y - a.cy) / a.ry;
        if (dx * dx + dy * dy <= 1) return a;
      } else if (a.type === 'text') {
        if (x >= a.x && x <= a.x + (a.measuredWidth || 100) && y >= a.y - a.fontSize && y <= a.y + 10) return a;
      } else if (a.type === 'step') {
        const dist = Math.hypot(x - a.x, y - a.y);
        if (dist <= 18) return a;
      } else if (a.type === 'arrow' || a.type === 'line') {
        // Distance to segment
        const dist = distanceToSegment(x, y, a.x1, a.y1, a.x2, a.y2);
        if (dist <= Math.max(8, a.width * 2)) return a;
      } else if (a.type === 'pen' || a.type === 'highlighter') {
        for (const pt of a.points) {
          if (Math.hypot(x - pt.x, y - pt.y) <= Math.max(8, a.width * 2)) return a;
        }
      }
    }
    return null;
  }

  function distanceToSegment(x, y, x1, y1, x2, y2) {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.hypot(x - xx, y - yy);
  }

  // Canvas Mouse Events
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click

    // Check spacebar pan
    if (isSpacePressed) {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      return;
    }

    const { x, y } = getCanvasCoords(e);
    isMouseDown = true;
    startX = x;
    startY = y;

    // SELECT TOOL
    if (currentTool === 'select') {
      const hit = hitTest(x, y);
      if (hit) {
        selectedAnnotation = hit;
        isMovingSelected = true;
        moveOffset = { x: x, y: y };
        deleteSelectedGroup.classList.remove('hidden');
      } else {
        selectedAnnotation = null;
        deleteSelectedGroup.classList.add('hidden');
      }
      render();
      return;
    }

    // DRAWING TOOLS
    pushState();

    if (currentTool === 'pen') {
      currentAction = {
        type: 'pen',
        points: [{ x, y }],
        color: currentColor,
        width: currentStrokeWidth
      };
    } else if (currentTool === 'highlighter') {
      currentAction = {
        type: 'highlighter',
        points: [{ x, y }],
        color: currentColor,
        width: currentStrokeWidth * 3.5
      };
    } else if (currentTool === 'arrow') {
      currentAction = {
        type: 'arrow',
        x1: x, y1: y,
        x2: x, y2: y,
        color: currentColor,
        width: currentStrokeWidth
      };
    } else if (currentTool === 'line') {
      currentAction = {
        type: 'line',
        x1: x, y1: y,
        x2: x, y2: y,
        color: currentColor,
        width: currentStrokeWidth
      };
    } else if (currentTool === 'rect') {
      currentAction = {
        type: 'rect',
        x, y, w: 0, h: 0,
        strokeColor: currentColor,
        fillStyle: currentFillStyle,
        strokeWidth: currentStrokeWidth
      };
    } else if (currentTool === 'circle') {
      currentAction = {
        type: 'circle',
        cx: x, cy: y, rx: 0, ry: 0,
        strokeColor: currentColor,
        fillStyle: currentFillStyle,
        strokeWidth: currentStrokeWidth
      };
    } else if (currentTool === 'blur') {
      currentAction = {
        type: 'blur',
        x, y, w: 0, h: 0
      };
    } else if (currentTool === 'step') {
      annotations.push({
        type: 'step',
        x, y,
        number: stepCounter++,
        color: currentColor
      });
      isMouseDown = false;
      render();
    } else if (currentTool === 'text') {
      isMouseDown = false;
      createInlineTextInput(x, y);
    }
  });

  window.addEventListener('mousemove', (e) => {
    // Pan Canvas
    if (isPanning) {
      canvasViewport.scrollLeft -= e.clientX - panStartX;
      canvasViewport.scrollTop -= e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      return;
    }

    if (!isMouseDown) return;
    const { x, y } = getCanvasCoords(e);

    // Moving an existing selected annotation
    if (isMovingSelected && selectedAnnotation) {
      const dx = x - moveOffset.x;
      const dy = y - moveOffset.y;
      moveOffset = { x, y };

      if (selectedAnnotation.type === 'pen' || selectedAnnotation.type === 'highlighter') {
        selectedAnnotation.points.forEach((p) => { p.x += dx; p.y += dy; });
      } else if (selectedAnnotation.type === 'arrow' || selectedAnnotation.type === 'line') {
        selectedAnnotation.x1 += dx; selectedAnnotation.y1 += dy;
        selectedAnnotation.x2 += dx; selectedAnnotation.y2 += dy;
      } else if (selectedAnnotation.type === 'circle') {
        selectedAnnotation.cx += dx; selectedAnnotation.cy += dy;
      } else {
        selectedAnnotation.x += dx; selectedAnnotation.y += dy;
      }
      render();
      return;
    }

    // Active tool drawing
    if (currentAction) {
      if (currentAction.type === 'pen' || currentAction.type === 'highlighter') {
        currentAction.points.push({ x, y });
      } else if (currentAction.type === 'arrow' || currentAction.type === 'line') {
        currentAction.x2 = x;
        currentAction.y2 = y;
      } else if (currentAction.type === 'rect' || currentAction.type === 'blur') {
        currentAction.x = Math.min(startX, x);
        currentAction.y = Math.min(startY, y);
        currentAction.w = Math.abs(x - startX);
        currentAction.h = Math.abs(y - startY);
      } else if (currentAction.type === 'circle') {
        currentAction.cx = (startX + x) / 2;
        currentAction.cy = (startY + y) / 2;
        currentAction.rx = Math.abs(x - startX) / 2;
        currentAction.ry = Math.abs(y - startY) / 2;
      }
      render();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
    }

    if (isMovingSelected) {
      isMovingSelected = false;
    }

    if (isMouseDown && currentAction) {
      isMouseDown = false;
      // Filter out tiny accidental clicks
      let isValid = true;
      if (['rect', 'circle', 'blur'].includes(currentAction.type)) {
        if ((currentAction.w || currentAction.rx * 2) < 4 || (currentAction.h || currentAction.ry * 2) < 4) {
          isValid = false;
        }
      } else if (['arrow', 'line'].includes(currentAction.type)) {
        if (Math.hypot(currentAction.x2 - currentAction.x1, currentAction.y2 - currentAction.y1) < 5) {
          isValid = false;
        }
      } else if (['pen', 'highlighter'].includes(currentAction.type)) {
        if (currentAction.points.length < 2) isValid = false;
      }

      if (isValid) {
        annotations.push(currentAction);
      } else {
        // Rollback state
        undoStack.pop();
        updateHistoryButtons();
      }
      currentAction = null;
      render();
    }
  });

  // Inline Text Input Tool
  function createInlineTextInput(canvasX, canvasY) {
    const input = document.createElement('textarea');
    input.className = 'canvas-inline-text-input';
    input.style.position = 'absolute';
    input.style.left = `${canvasX}px`;
    input.style.top = `${canvasY}px`;
    input.style.color = currentColor;
    input.style.fontSize = `${currentFontSize}px`;
    input.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    input.style.fontWeight = '700';
    input.style.background = 'rgba(15, 23, 42, 0.7)';
    input.style.border = '1px solid #6366f1';
    input.style.borderRadius = '4px';
    input.style.padding = '4px 8px';
    input.style.outline = 'none';
    input.style.resize = 'both';
    input.style.zIndex = '60';
    input.rows = 1;

    canvasContainer.appendChild(input);
    input.focus();

    function commitText() {
      const text = input.value.trim();
      if (text) {
        ctx.font = `bold ${currentFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const metrics = ctx.measureText(text);
        annotations.push({
          type: 'text',
          x: canvasX,
          y: canvasY + currentFontSize,
          text: text,
          color: currentColor,
          fontSize: currentFontSize,
          measuredWidth: metrics.width
        });
      } else {
        undoStack.pop();
        updateHistoryButtons();
      }
      if (input.parentNode) input.parentNode.removeChild(input);
      render();
    }

    input.addEventListener('blur', commitText);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitText();
      } else if (e.key === 'Escape') {
        if (input.parentNode) input.parentNode.removeChild(input);
        undoStack.pop();
        updateHistoryButtons();
      }
    });
  }

  // Draw Arrow Function
  function drawArrow(ctx, x1, y1, x2, y2, color, strokeWidth) {
    const headLen = Math.max(14, strokeWidth * 3.5);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw main line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Draw Pixelated Blur Region
  function drawPixelatedRegion(targetCtx, x, y, w, h) {
    if (w <= 0 || h <= 0) return;
    const pixelSize = 12;
    const miniW = Math.max(1, Math.floor(w / pixelSize));
    const miniH = Math.max(1, Math.floor(h / pixelSize));

    const miniCanvas = document.createElement('canvas');
    miniCanvas.width = miniW;
    miniCanvas.height = miniH;
    const miniCtx = miniCanvas.getContext('2d');
    miniCtx.imageSmoothingEnabled = false;

    // Scale down
    miniCtx.drawImage(baseCanvas, x, y, w, h, 0, 0, miniW, miniH);

    // Scale up onto target
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(miniCanvas, 0, 0, miniW, miniH, x, y, w, h);

    // Border around blurred area
    targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    targetCtx.lineWidth = 1;
    targetCtx.strokeRect(x, y, w, h);
    targetCtx.restore();
  }

  // Render Master Canvas
  function renderItem(targetCtx, item) {
    targetCtx.save();

    if (item.type === 'pen') {
      targetCtx.strokeStyle = item.color;
      targetCtx.lineWidth = item.width;
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.beginPath();
      item.points.forEach((pt, idx) => {
        if (idx === 0) targetCtx.moveTo(pt.x, pt.y);
        else targetCtx.lineTo(pt.x, pt.y);
      });
      targetCtx.stroke();

    } else if (item.type === 'highlighter') {
      targetCtx.save();
      targetCtx.globalAlpha = 0.38;
      targetCtx.strokeStyle = item.color;
      targetCtx.lineWidth = item.width;
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.beginPath();
      item.points.forEach((pt, idx) => {
        if (idx === 0) targetCtx.moveTo(pt.x, pt.y);
        else targetCtx.lineTo(pt.x, pt.y);
      });
      targetCtx.stroke();
      targetCtx.restore();

    } else if (item.type === 'arrow') {
      drawArrow(targetCtx, item.x1, item.y1, item.x2, item.y2, item.color, item.width);

    } else if (item.type === 'line') {
      targetCtx.strokeStyle = item.color;
      targetCtx.lineWidth = item.width;
      targetCtx.lineCap = 'round';
      targetCtx.beginPath();
      targetCtx.moveTo(item.x1, item.y1);
      targetCtx.lineTo(item.x2, item.y2);
      targetCtx.stroke();

    } else if (item.type === 'rect') {
      targetCtx.strokeStyle = item.strokeColor;
      targetCtx.lineWidth = item.strokeWidth;
      if (item.fillStyle === 'solid') {
        targetCtx.fillStyle = item.strokeColor;
        targetCtx.fillRect(item.x, item.y, item.w, item.h);
      } else if (item.fillStyle === 'semi') {
        targetCtx.fillStyle = item.strokeColor + '33';
        targetCtx.fillRect(item.x, item.y, item.w, item.h);
      }
      targetCtx.strokeRect(item.x, item.y, item.w, item.h);

    } else if (item.type === 'circle') {
      targetCtx.strokeStyle = item.strokeColor;
      targetCtx.lineWidth = item.strokeWidth;
      targetCtx.beginPath();
      targetCtx.ellipse(item.cx, item.cy, Math.max(1, item.rx), Math.max(1, item.ry), 0, 0, Math.PI * 2);
      if (item.fillStyle === 'solid') {
        targetCtx.fillStyle = item.strokeColor;
        targetCtx.fill();
      } else if (item.fillStyle === 'semi') {
        targetCtx.fillStyle = item.strokeColor + '33';
        targetCtx.fill();
      }
      targetCtx.stroke();

    } else if (item.type === 'text') {
      targetCtx.font = `bold ${item.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      // Soft text shadow for readability on any background
      targetCtx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      targetCtx.shadowBlur = 4;
      targetCtx.fillStyle = item.color;
      targetCtx.fillText(item.text, item.x, item.y);

    } else if (item.type === 'blur') {
      drawPixelatedRegion(targetCtx, item.x, item.y, item.w, item.h);

    } else if (item.type === 'step') {
      const radius = 16;
      targetCtx.beginPath();
      targetCtx.arc(item.x, item.y, radius, 0, Math.PI * 2);
      targetCtx.fillStyle = item.color;
      targetCtx.fill();
      targetCtx.lineWidth = 2.5;
      targetCtx.strokeStyle = '#ffffff';
      targetCtx.stroke();

      targetCtx.fillStyle = '#ffffff';
      targetCtx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      targetCtx.textAlign = 'center';
      targetCtx.textBaseline = 'middle';
      targetCtx.fillText(item.number, item.x, item.y);
    }

    targetCtx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw base screenshot
    if (baseCanvas.width > 0 && baseCanvas.height > 0) {
      ctx.drawImage(baseCanvas, 0, 0);
    }

    // 2. Draw committed annotations
    annotations.forEach((item) => renderItem(ctx, item));

    // 3. Draw active drawing action preview
    if (currentAction) {
      renderItem(ctx, currentAction);
    }

    // 4. Highlight selected annotation if any
    if (selectedAnnotation) {
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);

      if (selectedAnnotation.type === 'rect' || selectedAnnotation.type === 'blur') {
        ctx.strokeRect(selectedAnnotation.x - 3, selectedAnnotation.y - 3, selectedAnnotation.w + 6, selectedAnnotation.h + 6);
      } else if (selectedAnnotation.type === 'circle') {
        ctx.strokeRect(
          selectedAnnotation.cx - selectedAnnotation.rx - 4,
          selectedAnnotation.cy - selectedAnnotation.ry - 4,
          selectedAnnotation.rx * 2 + 8,
          selectedAnnotation.ry * 2 + 8
        );
      } else if (selectedAnnotation.type === 'text') {
        ctx.strokeRect(
          selectedAnnotation.x - 4,
          selectedAnnotation.y - selectedAnnotation.fontSize - 4,
          (selectedAnnotation.measuredWidth || 100) + 8,
          selectedAnnotation.fontSize + 12
        );
      } else if (selectedAnnotation.type === 'step') {
        ctx.strokeRect(selectedAnnotation.x - 20, selectedAnnotation.y - 20, 40, 40);
      }
      ctx.restore();
    }
  }

  // Export / Download Engine
  function generateExportBlob(type = 'image/png', quality = 0.95) {
    return new Promise((resolve) => {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const expCtx = exportCanvas.getContext('2d');

      // For JPEG, fill white background first
      if (type === 'image/jpeg') {
        expCtx.fillStyle = '#ffffff';
        expCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }

      // Draw base canvas
      expCtx.drawImage(baseCanvas, 0, 0);

      // Draw all annotations
      annotations.forEach((item) => renderItem(expCtx, item));

      exportCanvas.toBlob(resolve, type, quality);
    });
  }

  async function downloadImage(format = 'png') {
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await generateExportBlob(mimeType, 0.95);
    if (!blob) {
      showToast('Error generating image file.');
      return;
    }

    let fname = filenameInput.value.trim() || 'screenshot.png';
    if (!fname.toLowerCase().endsWith('.' + format)) {
      fname = fname.replace(/\.[^/.]+$/, '') + '.' + format;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast(`Downloaded as ${fname}`);
  }

  btnDownloadPng.addEventListener('click', () => downloadImage('png'));
  btnDownloadJpg.addEventListener('click', () => {
    downloadMenu.classList.add('hidden');
    downloadImage('jpeg');
  });

  btnDownloadMore.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.download-group')) {
      downloadMenu.classList.add('hidden');
    }
  });

  // Copy to Clipboard
  btnCopy.addEventListener('click', async () => {
    try {
      const blob = await generateExportBlob('image/png');
      if (!blob) throw new Error('Blob generation failed');

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      showToast('✓ Copied image to clipboard!');
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Could not copy to clipboard.');
    }
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // If user is typing in filename or inline text, skip tool shortcuts
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      isSpacePressed = true;
      canvas.style.cursor = 'grab';
    }

    // Ctrl+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      downloadImage('png');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      btnCopy.click();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedAnnotation) {
        btnDeleteSelected.click();
      }
    } else {
      // Tool shortcuts
      const key = e.key.toLowerCase();
      if (key === 'v') selectTool('select');
      else if (key === 'c') selectTool('crop');
      else if (key === 'p') selectTool('pen');
      else if (key === 'h') selectTool('highlighter');
      else if (key === 'a') selectTool('arrow');
      else if (key === 'l') selectTool('line');
      else if (key === 'r') selectTool('rect');
      else if (key === 'o') selectTool('circle');
      else if (key === 't') selectTool('text');
      else if (key === 'b') selectTool('blur');
      else if (key === 's') selectTool('step');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      canvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
    }
  });

  // Mouse Wheel Zoom / Scroll
  canvasViewport.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(zoomScale + delta);
    }
  }, { passive: false });

  // Initialize
  await initSession();
});

