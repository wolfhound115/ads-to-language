// Namespace shared across content scripts (they run in the same isolated world).
window.MZH = window.MZH || {};

// --- Phase 1: a few hardcoded selectors to verify the replacement logic. ---
// These cover the most common Google ad slots:
//   - <ins class="adsbygoogle"> (AdSense)
//   - Google Publisher Tag containers (<div id="div-gpt-ad-...">)
//   - The cross-origin ad iframes GPT/AdSense inject
window.MZH.AD_SELECTORS = [
  "ins.adsbygoogle",
  "[id^='div-gpt-ad']",
  "iframe[id^='google_ads_iframe']"
];

// --- Phase 2 (TODO): full EasyList support. ---
// Plan: ship a snapshot of easylist.txt, parse only the generic cosmetic
// rules (lines starting with "##"), split them into selector batches, and
// concat them into MZH.AD_SELECTORS at startup. Network/exception rules
// ($-options, ||domain^ etc.) are ignored — we only need element hiding
// selectors, since we replace rather than block.
//
// window.MZH.parseEasyList = function (text) {
//   return text.split("\n")
//     .filter(line => line.startsWith("##"))
//     .map(line => line.slice(2));
// };
