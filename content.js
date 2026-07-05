// Finds ad containers and swaps them for flashcards, preserving dimensions.
(() => {
  const MZH = window.MZH;
  const MIN_W = 100; // ignore tracking pixels / collapsed slots
  const MIN_H = 40;

  function insideOurCard(el) {
    return !!(el.closest && el.closest("[data-mzh-card]"));
  }

  // Replace an ad element with a flashcard sized to the slot it occupied.
  // Works for plain containers AND cross-origin iframes: we never need to
  // reach inside the frame — we just measure it from the parent document
  // and replace the node itself.
  function replaceAd(el) {
    if (!el.isConnected || insideOurCard(el)) return;

    const rect = el.getBoundingClientRect();
    let w = rect.width;
    let h = rect.height;

    // Slots that haven't rendered yet often have width/height attributes
    // (typical on <ins> and ad iframes) — fall back to those.
    if (w < MIN_W || h < MIN_H) {
      w = parseFloat(el.getAttribute("width")) || w;
      h = parseFloat(el.getAttribute("height")) || h;
    }
    if (w < MIN_W || h < MIN_H) return; // still collapsed; retry on next scan

    el.replaceWith(MZH.createCard(Math.round(w), Math.round(h)));
  }

  function scan(root) {
    for (const selector of MZH.AD_SELECTORS) {
      let matches;
      try {
        matches = root.querySelectorAll(selector);
      } catch (e) {
        continue; // bad selector (will matter once EasyList rules are wired in)
      }
      matches.forEach(replaceAd);
      if (root !== document && root.matches && root.matches(selector)) {
        replaceAd(root);
      }
    }
  }

  // Debounced rescan so bursts of mutations trigger one pass.
  let scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => {
      scanQueued = false;
      scan(document);
    }, 100);
  }

  // Catch ads injected after load (most of them).
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        queueScan();
        return;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial pass + a few delayed passes: ad slots often start collapsed
  // (0x0) and only get their size once the ad script runs.
  scan(document);
  [1000, 3000, 7000].forEach((ms) => setTimeout(() => scan(document), ms));
})();
