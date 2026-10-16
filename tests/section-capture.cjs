// Run with Playwright installed: node tests/section-capture.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content/section.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const scenario of ['large', 'overflow', 'cancel', 'failure']) {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1.25 });
      let finished;
      let captures = 0;
      let error;
      page.on('dialog', async dialog => { error = dialog.message(); await dialog.dismiss(); });
      await page.exposeFunction('sendCaptureMessage', async message => {
        if (message.action === 'CAPTURE_SLICE') {
          captures++;
          if (scenario === 'failure') return { error: 'Test capture failure' };
          const buffer = await page.screenshot();
          return { dataUrl: `data:image/png;base64,${buffer.toString('base64')}` };
        }
        if (message.action === 'FINISH_SECTION') { finished = message.image; return { success: true }; }
        return {};
      });
      await page.setContent(`<style>
        body { margin:0; padding:40px; background:#fff; }
        #target { width:1100px; height:1500px; background:rgb(255,0,0); }
        #bottom { height:100px; background:rgb(0,0,255); }
        #top { height:1400px; }
        #sticky { position:fixed; top:0; left:0; width:100%; height:60px; background:black; }
      </style><div id="sticky"></div><div id="target"><div id="top"></div><div id="bottom"></div></div>`);
      if (scenario === 'overflow') {
        await page.evaluate(() => {
          document.querySelector('#target').style.cssText = 'width:500px;height:300px;overflow:auto';
          document.querySelector('#target').scrollTop = 75;
        });
      }
      const original = await page.evaluate(() => {
        window.scrollTo(0, 20);
        window.pageClicks = 0;
        document.addEventListener('click', () => window.pageClicks++);
        window.chrome = { runtime: { sendMessage: message => window.sendCaptureMessage(message) } };
        return { style: document.querySelector('#target').getAttribute('style'),
          innerScroll: document.querySelector('#target').scrollTop, y: window.scrollY };
      });
      await page.evaluate(source);
      await page.mouse.move(100, 150);
      // The hovered child is selected first; Up picks the enclosing div.
      await page.keyboard.press('ArrowUp');
      if (scenario === 'cancel') await page.keyboard.press('Escape');
      else { await page.mouse.down(); await page.mouse.up(); }
      await page.waitForFunction(() => !window.__snapcraft_section, { timeout: 20000 });
      await page.waitForTimeout(100);
      assert.deepEqual(await page.evaluate(() => ({
        style: document.querySelector('#target').getAttribute('style'),
        innerScroll: document.querySelector('#target').scrollTop, y: window.scrollY
      })), original, `${scenario}: page state restored`);
      assert.equal(await page.evaluate(() => window.pageClicks), 0, 'capture click must not reach the page');
      if (scenario === 'cancel') { assert.equal(captures, 0); assert.equal(finished, undefined); }
      else if (scenario === 'failure') { assert.match(error, /Test capture failure/); assert.equal(finished, undefined); }
      else {
        assert.ok(finished, `${scenario}: screenshot delivered`);
        const pixels = await page.evaluate(async data => {
          const image = new Image(); image.src = data; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          return { width: image.width, height: image.height,
            top: [...ctx.getImageData(10, 10, 1, 1).data],
            bottom: [...ctx.getImageData(image.width - 10, image.height - 10, 1, 1).data] };
        }, finished);
        assert.equal(pixels.width, (scenario === 'overflow' ? 500 : 1100) * 1.25);
        assert.equal(pixels.height, 1875);
        assert.deepEqual(pixels.top, [255, 0, 0, 255]);
        assert.deepEqual(pixels.bottom, [0, 0, 255, 255]);
      }
      // Cleanup allows the page to receive normal clicks again.
      await page.mouse.click(100, 150);
      assert.equal(await page.evaluate(() => window.pageClicks), 1);
      console.log(`PASS ${scenario}`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
