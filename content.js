// Finds ad containers and swaps them for flashcards, preserving dimensions.
(async () => {
  const MZH = window.MZH;
  const MIN_W = 100; // ignore tracking pixels / collapsed slots
  const MIN_H = 40;
  const MAX_TEXT = 400; // real content mislabeled as an ad has lots of text
  let maxReplacements = 12; // safety cap so generic rules can't nuke a layout
  let replaced = 0;

  // Lifetime "ads replaced" counter (debounced; approximate across tabs).
  let pendingCount = 0, countTimer = null;
  function bumpReplacedCounter() {
    pendingCount++;
    if (countTimer) return;
    countTimer = setTimeout(async () => {
      const n = pendingCount;
      pendingCount = 0;
      countTimer = null;
      try {
        const { mzhReplaced } = await chrome.storage.local.get("mzhReplaced");
        await chrome.storage.local.set({ mzhReplaced: (mzhReplaced || 0) + n });
      } catch (e) { /* extension context gone */ }
    }, 500);
  }

  function insideOurCard(el) {
    return !!(el.closest && el.closest("[data-mzh-card]"));
  }

  // Replace an ad element with a flashcard sized to the slot it occupied.
  // Works for plain containers AND cross-origin iframes: we never need to
  // reach inside the frame — we just measure it from the parent document
  // and replace the node itself.
  function replaceAd(el) {
    if (replaced >= maxReplacements) return;
    if (!el.isConnected || insideOurCard(el)) return;

    // Guard against EasyList false positives: ad slots are (nearly) empty
    // or iframe-only; if there's substantial text, it's probably content.
    if ((el.textContent || "").trim().length > MAX_TEXT) return;

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

    replaced++;
    el.replaceWith(MZH.createCard(Math.round(w), Math.round(h)));
    bumpReplacedCounter();
  }

  function scan(root) {
    for (const batch of MZH.SELECTOR_BATCHES) {
      let matches;
      try {
        matches = root.querySelectorAll(batch);
      } catch (e) {
        continue;
      }
      matches.forEach(replaceAd);
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

  // Wait for settings + selector list before touching the page; respect the
  // global toggle and the per-site disable list.
  await Promise.all([MZH.ready, MZH.selectorsReady]);
  if (!MZH.settings.enabled) return;
  if ((MZH.settings.disabledSites || []).includes(location.hostname)) return;
  maxReplacements = MZH.settings.maxPerPage || 12;

  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial pass + a few delayed passes: ad slots often start collapsed
  // (0x0) and only get their size once the ad script runs.
  scan(document);
  [1000, 3000, 7000].forEach((ms) => setTimeout(() => scan(document), ms));
})();
