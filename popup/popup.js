document.addEventListener('DOMContentLoaded', async () => {
  const btnFullPage = document.getElementById('btn-full-page');
  const btnVisible = document.getElementById('btn-visible-window');
  const btnSelection = document.getElementById('btn-selection');
  const delaySelect = document.getElementById('delay-select');
  const statusBanner = document.getElementById('status-banner');

  // Verify tab accessibility
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const isRestrictedUrl = tab.url && (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('view-source:')
  );

  if (isRestrictedUrl) {
    statusBanner.textContent = 'Chrome restricts extensions on internal system pages. Please switch to a regular web page.';
    statusBanner.classList.remove('hidden');
    btnFullPage.disabled = true;
    btnVisible.disabled = true;
    btnSelection.disabled = true;
    btnFullPage.style.opacity = '0.5';
    btnVisible.style.opacity = '0.5';
    btnSelection.style.opacity = '0.5';
    return;
  }

  function triggerCapture(mode) {
    const delay = parseInt(delaySelect.value, 10) || 0;
    
    // Send message to background script
    chrome.runtime.sendMessage({
      action: 'INIT_CAPTURE',
      mode: mode,
      tabId: tab.id,
      windowId: tab.windowId,
      delay: delay
    });

    // Close popup so user gets clear view
    window.close();
  }

  btnFullPage.addEventListener('click', () => triggerCapture('full-page'));
  btnVisible.addEventListener('click', () => triggerCapture('visible'));
  btnSelection.addEventListener('click', () => triggerCapture('selection'));
});

