// Vocab loading, settings, weighted selection, and review recording.
window.MZH = window.MZH || {};

(() => {
  const MZH = window.MZH;
  const WEIGHTS_KEY = "mzhWeights";
  const STATS_KEY = "mzhStats";
  const SETTINGS_KEY = "mzhSettings";
  const MIN_WEIGHT = 0.125; // well-known words show up 8x less often
  const MAX_WEIGHT = 8;     // struggling words show up 8x more often

  MZH.MIN_WEIGHT = MIN_WEIGHT;
  MZH.DEFAULT_SETTINGS = {
    enabled: true,
    deck: "both",        // "hsk1" | "hsk2" | "hsk3" | "both" (1+2) | "all"
    pinyinFront: false,  // show pinyin on the front of the card
    audio: true,         // show the pronunciation button
    dailyGoal: 20,
    disabledSites: [],   // hostnames where we leave the page alone
  };
  const DECK_LEVELS = {
    hsk1: [1], hsk2: [2], hsk3: [3],
    both: [1, 2], all: [1, 2, 3],
  };

  let vocab = [];
  let weights = {};                    // { [index]: number }, default 1
  let stats = { days: {}, words: {} }; // days: {date:{r,k}}, words: {idx:{k,m}}
  MZH.settings = { ...MZH.DEFAULT_SETTINGS };

  // Resolves once vocab + stored weights/stats/settings are loaded.
  MZH.ready = (async () => {
    const res = await fetch(chrome.runtime.getURL("data/vocab.json"));
    vocab = await res.json();
    try {
      const local = await chrome.storage.local.get([WEIGHTS_KEY, STATS_KEY]);
      weights = local[WEIGHTS_KEY] || {};
      stats = local[STATS_KEY] || { days: {}, words: {} };
      const sync = await chrome.storage.sync.get(SETTINGS_KEY);
      MZH.settings = { ...MZH.DEFAULT_SETTINGS, ...(sync[SETTINGS_KEY] || {}) };
    } catch (e) {
      /* storage unavailable; run with defaults */
    }
    // Live settings: new cards on this page pick up popup changes without
    // a reload (enable/disable and already-replaced ads still need one).
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[SETTINGS_KEY]) {
          MZH.settings = { ...MZH.DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
        }
      });
    } catch (e) { /* onChanged unavailable */ }
  })();

  function deckIndices() {
    const levels = DECK_LEVELS[MZH.settings.deck] || DECK_LEVELS.all;
    const idx = [];
    for (let i = 0; i < vocab.length; i++) if (levels.includes(vocab[i].hsk)) idx.push(i);
    return idx.length ? idx : vocab.map((_, i) => i);
  }

  // Words currently displayed on this page — avoid showing duplicates
  // when several ad slots become cards at once.
  MZH.activeWords = new Set();

  function drawOne(idx) {
    let total = 0;
    for (const i of idx) total += weights[i] ?? 1;
    let r = Math.random() * total;
    for (const i of idx) {
      r -= weights[i] ?? 1;
      if (r <= 0) return i;
    }
    return idx[0];
  }

  // Weighted random pick from the active deck, avoiding words already on
  // screen (best effort — gives up after a few redraws).
  MZH.pickWord = function () {
    const idx = deckIndices();
    let i = drawOne(idx);
    for (let tries = 0; tries < 12 && MZH.activeWords.has(i); tries++) i = drawOne(idx);
    return { index: i, ...vocab[i] };
  };

  // Mastery tier of a word: "new" | "learning" | "tricky" | "known".
  MZH.tierOf = function (index) {
    return MZH.stats.mastery(weights[index] ?? 1, !!stats.words[index]);
  };

  // result: "knew" (weight /2), "fuzzy" (x sqrt2 — half a "didn't", keeps the
  // word in rotation without punishing), or "missed" (x2). Clamped, logged
  // for stats. Returns { weight, mastered } where mastered is true the
  // moment a word first hits the minimum weight.
  const FACTOR = { knew: 0.5, fuzzy: Math.SQRT2, missed: 2 };
  MZH.recordResult = function (index, result) {
    const old = weights[index] ?? 1;
    const w = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, old * (FACTOR[result] || 2)));
    weights[index] = w;

    const day = MZH.stats.todayKey();
    const d = stats.days[day] || (stats.days[day] = { r: 0, k: 0, f: 0 });
    d.r++;
    if (result === "knew") d.k++;
    if (result === "fuzzy") d.f = (d.f || 0) + 1;
    const ws = stats.words[index] || (stats.words[index] = { k: 0, m: 0, f: 0 });
    if (result === "knew") ws.k++;
    else if (result === "fuzzy") ws.f = (ws.f || 0) + 1;
    else ws.m++;

    try {
      chrome.storage.local.set({ [WEIGHTS_KEY]: weights, [STATS_KEY]: stats });
    } catch (e) {
      /* extension context gone (page navigating); ignore */
    }
    return { weight: w, mastered: result === "knew" && old > MIN_WEIGHT && w <= MIN_WEIGHT };
  };

  MZH.todayProgress = function () {
    const d = stats.days[MZH.stats.todayKey()];
    return { done: d ? d.r : 0, goal: MZH.settings.dailyGoal };
  };
})();
