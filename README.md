# SnapCraft - Smart Screenshot & Annotation Tool for Google Chrome

A modern, high-performance Google Chrome Extension (Manifest V3) for capturing full webpage screenshots, current visible windows, or custom selected regions, with a built-in annotation editor and studio.

---

## 🌟 Key Features

### 1. 4 Customizable Capture Modes
- **Section Capture**:
  - Hover over a div or semantic section to see its highlighted border, then click to capture it.
  - Press **Up arrow** to select a parent section, or **Esc** to cancel selection/capture.
  - Captures tall and wide sections by scrolling and stitching only the selected bounds. A selected scrollable div is temporarily expanded to capture its content.
  - Restores the page layout and scroll position and opens the result in the annotation editor.
  - Keep the tab active until capture finishes. Content inside cross-origin frames or closed shadow roots cannot be selected individually. Independently scrolling descendants keep their own visible content; select that scrolling div directly to capture its full content.
- **📄 Full Page Screenshot**:
  - Automatically scrolls down the webpage, captures viewport slices, and stitches them seamlessly into a high-resolution, full-page screenshot.
  - Smart deduplication of `position: fixed` and `position: sticky` headers (headers only appear once at the top, without repeating across slices).
  - Floating progress HUD showing live capture progress.
- **💻 Visible Window**:
  - Instant one-click screenshot of the currently visible screen/viewport.
- **✂️ Selected Area**:
  - Interactive full-screen overlay with crosshairs.
  - Click-and-drag to select any portion of the screen with a live dimension indicator (e.g. `1280 × 720 px`).
  - Supports quick confirmation or cancellation via keyboard (<kbd>Enter</kbd> / <kbd>ESC</kbd>) or on-screen action buttons.

### 2. Built-in Editor & Annotation Studio
Every screenshot opens automatically in a dedicated tab featuring an annotation studio:
- **✂️ Crop Tool**: Interactive 8-handle crop box with live pixel measurements, Apply, and Cancel.
- **✏️ Freehand Pen**: Smooth drawing tool with customizable stroke widths and colors.
- **🖊️ Highlighter**: Semi-transparent marker tool for emphasizing paragraphs and code.
- **↗️ Arrow Tool**: Crisp callout arrows with automatic arrowhead calculation.
- **📏 Line Tool**: Clean straight lines.
- **🔲 Rectangle & ⭕ Circle / Ellipse**: Supports Outline, Semi-transparent Tint, and Solid fills.
- **🔤 Text Tool**: Inline editable text boxes with customizable font sizes and color presets.
- **💧 Blur / Pixelate**: Obscures sensitive information (passwords, emails, tokens, personal data) using authentic pixelation.
- **🔢 Step Counter Badge**: Click to stamp sequential numbered circular badges (`1`, `2`, `3`...) for documentation and bug reports.
- **👆 Select & Move**: Click any annotation to select, drag/reposition, or delete it.

### 3. Controls & Exporting
- **Undo / Redo / Reset**: Full state history for all edits, crops, and annotations (<kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>).
- **Zoom & Pan**: Zoom In (<kbd>+</kbd>), Zoom Out (<kbd>-</kbd>), Fit to Screen, 1:1 Actual Size, and Spacebar + Drag panning.
- **📋 Copy to Clipboard**: One-click copy directly to your system clipboard (`image/png`).
- **⬇ Download PNG & JPEG**: High-quality export with customizable file names.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> | Capture Full Page |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> | Capture Visible Window |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Capture Selected Area |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo edit |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Redo edit |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save / Download screenshot |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | Copy image to clipboard |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete selected annotation |
| <kbd>Space</kbd> + Drag | Pan across canvas |
| <kbd>Ctrl</kbd> + Mouse Wheel | Zoom In / Out |

---

## 🚀 How to Install in Google Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. Turn on the **Developer mode** toggle in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the folder:
   ```
   d:\Projects\ChromeExtensions\SnapCraft
   ```
6. The **SnapCraft** extension icon will appear in your Chrome toolbar!
7. Pin the extension to your toolbar for quick access.

---

## 📂 Project Structure

```
Screenshots Taker/
├── manifest.json              # Extension Manifest V3 configuration
├── icons/                     # Extension branding icons (16px, 48px, 128px)
├── popup/
│   ├── popup.html             # Popup menu interface
│   ├── popup.css              # Popup styling & gradients
│   └── popup.js               # Capture trigger logic & delay configuration
├── background/
│   └── background.js          # Service worker managing tabs, storage, & sessions
├── content/
│   ├── selection.js           # Interactive area selection overlay
│   ├── selection.css          # Selection box & crosshair styling
│   ├── fullpage.js            # Auto-scroll, slice capture, & sticky header deduplication
│   └── fullpage.css           # Floating capture progress HUD
├── editor/
│   ├── editor.html            # Editor studio layout
│   ├── editor.css             # Dark theme workspace styling & canvas layout
│   └── editor.js              # Annotation engine, crop, blur, zoom, & export
└── README.md                  # Documentation and user manual
```

