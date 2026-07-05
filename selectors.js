// Ad selectors: a hardcoded core + EasyList-style cosmetic rules parsed
// from a bundled snapshot (generic rules + domain-specific rules).
window.MZH = window.MZH || {};

(() => {
  const MZH = window.MZH;

  // Core selectors that must always work (most common Google ad slots).
  const HARDCODED = [
    "ins.adsbygoogle",
    "[id^='div-gpt-ad']",
    "iframe[id^='google_ads_iframe']",
    "iframe[src*='safeframe']",
    "div[data-google-query-id]",
  ];

  // Parses EasyList text, keeping element-hiding rules only:
  //   ##selector            -> generic (applies everywhere)
  //   a.com,b.com##selector -> domain-specific
  // Ignored on purpose: comments (!), network/blocking rules, exception
  // rules (#@#), extended-syntax rules (#?#), and negated domains (~a.com).
  // We only replace elements, so cosmetic rules are all we need.
  MZH.parseEasyList = function (text) {
    const generic = [];
    const byDomain = Object.create(null);
    for (let line of text.split("\n")) {
      line = line.trim();
      if (!line || line[0] === "!") continue;
      if (line.includes("#@#") || line.includes("#?#")) continue;
      const i = line.indexOf("##");
      if (i === -1) continue;
      const sel = line.slice(i + 2).trim();
      if (!sel) continue;
      if (i === 0) {
        generic.push(sel);
        continue;
      }
      const domains = line.slice(0, i).split(",");
      for (let d of domains) {
        d = d.trim().toLowerCase();
        if (!d || d[0] === "~" || d.includes("*")) continue;
        (byDomain[d] = byDomain[d] || []).push(sel);
      }
    }
    return { generic, byDomain };
  };

  // Selectors for a hostname: exact match plus every parent-domain match
  // (rules for "sfgate.com" apply on "www.sfgate.com").
  MZH.rulesForHost = function (byDomain, host) {
    host = (host || "").toLowerCase();
    const out = [];
    let h = host;
    while (h) {
      if (byDomain[h]) out.push(...byDomain[h]);
      const dot = h.indexOf(".");
      if (dot === -1) break;
      h = h.slice(dot + 1);
    }
    return out;
  };

  // querySelectorAll with thousands of separate calls is slow; join into
  // comma batches instead. Batched so one page-specific parse quirk can't
  // invalidate everything.
  MZH.batchSelectors = function (selectors, size = 400) {
    const batches = [];
    for (let i = 0; i < selectors.length; i += size) {
      batches.push(selectors.slice(i, i + size).join(","));
    }
    return batches;
  };

  MZH.AD_SELECTORS = [...HARDCODED];
  MZH.SELECTOR_BATCHES = [HARDCODED.join(",")];

  MZH.selectorsReady = (async () => {
    try {
      const res = await fetch(chrome.runtime.getURL("data/easylist-snapshot.txt"));
      const { generic, byDomain } = MZH.parseEasyList(await res.text());
      const hostRules = MZH.rulesForHost(byDomain, location.hostname);
      // Validate each selector so one bad rule can't break a whole batch.
      const probe = document.createDocumentFragment();
      const valid = [...hostRules, ...generic].filter((s) => {
        try { probe.querySelector(s); return true; } catch (e) { return false; }
      });
      MZH.AD_SELECTORS = [...HARDCODED, ...valid];
      MZH.SELECTOR_BATCHES = MZH.batchSelectors(MZH.AD_SELECTORS);
    } catch (e) {
      /* snapshot unavailable; hardcoded selectors still work */
    }
  })();
})();
