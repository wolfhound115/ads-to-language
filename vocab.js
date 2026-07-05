// Vocab loading + weighted selection + spaced-repetition-ish weighting.
window.MZH = window.MZH || {};

(() => {
  const MZH = window.MZH;
  const STORAGE_KEY = "mzhWeights";
  const MIN_WEIGHT = 0.125; // well-known words show up 8x less often
  const MAX_WEIGHT = 8;     // struggling words show up 8x more often

  let vocab = [];
  let weights = {}; // { [index]: number }, default 1

  // Resolves once vocab + stored weights are loaded. Cards await this.
  MZH.ready = (async () => {
    const res = await fetch(chrome.runtime.getURL("data/vocab.json"));
    vocab = await res.json();
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      weights = stored[STORAGE_KEY] || {};
    } catch (e) {
      weights = {}; // storage unavailable; fall back to unweighted
    }
  })();

  // Weighted random pick. Returns { index, hanzi, pinyin, english }.
  MZH.pickWord = function () {
    let total = 0;
    for (let i = 0; i < vocab.length; i++) total += weights[i] ?? 1;
    let r = Math.random() * total;
    for (let i = 0; i < vocab.length; i++) {
      r -= weights[i] ?? 1;
      if (r <= 0) return { index: i, ...vocab[i] };
    }
    return { index: 0, ...vocab[0] };
  };

  // "Knew it" halves the weight, "didn't" doubles it (clamped).
  MZH.recordResult = function (index, knew) {
    const w = weights[index] ?? 1;
    weights[index] = knew
      ? Math.max(MIN_WEIGHT, w / 2)
      : Math.min(MAX_WEIGHT, w * 2);
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: weights });
    } catch (e) {
      /* extension context gone (page navigating); ignore */
    }
  };
})();
