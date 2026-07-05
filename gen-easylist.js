// Dev-only: builds data/easylist-snapshot.txt from a full easylist.txt.
// Keeps generic cosmetic rules (##sel) and domain-specific cosmetic rules
// (domain##sel); drops network rules, exceptions (#@#), and extended
// syntax (#?#). A curated core is prepended as a safety net for common
// ad classes that upstream EasyList expresses via network rules instead.
// Usage: node gen-easylist.js /tmp/easylist.txt
const fs = require("fs");

const CORE = [
  "! --- curated core (always useful, kept independent of upstream) ---",
  "##.ad-banner", "##.ad-container", "##.ad-wrapper", "##.ad-slot", "##.ad-box",
  "##.ad-unit", "##.adunit", "##.ad_unit", "##.ad-leaderboard", "##.ad-rectangle",
  "##.ad-placement", "##.advertisement", "##.advert-banner", "##.banner-ad",
  "##.display-ad", "##.google-ad", "##.sponsored-ad", "##.dfp-ad", "##.gpt-ad",
  "##.sidebar-ad", "##.mobile-ad", "###ad-banner", "###ad-container",
  "###banner-ad", "###google-ads",
  "##div[data-ad-slot]", "##div[data-ad-unit]",
  "##iframe[src*=\"doubleclick.net\"]", "##iframe[src*=\"googlesyndication.com\"]",
  "##div[id^=\"taboola-\"]", "##.OUTBRAIN", "##.trc_related_container",
];

const src = process.argv[2] || "/tmp/easylist.txt";
const lines = fs.readFileSync(src, "utf8").split("\n");
const domainRe = /^[a-z0-9~,.*-]+$/i;
let generic = 0, domain = 0;
const kept = [];
for (let l of lines) {
  l = l.trim();
  if (l.startsWith("##")) { kept.push(l); generic++; continue; }
  const i = l.indexOf("##");
  if (i > 0 && !l.includes("#@#") && !l.includes("#?#") && domainRe.test(l.slice(0, i))) {
    kept.push(l);
    domain++;
  }
}
const out = "! Snapshot of EasyList cosmetic rules (generic + domain-specific)\n"
  + "! Source: easylist.to, 2026-07-05. Regenerate with: node gen-easylist.js <easylist.txt>\n"
  + CORE.join("\n") + "\n" + kept.join("\n") + "\n";
fs.writeFileSync(__dirname + "/data/easylist-snapshot.txt", out);
console.log("generic:", generic, "domain lines:", domain,
  "size:", (out.length / 1024).toFixed(0) + "KB");
console.log("sfgate rules:", kept.filter((l) => l.includes("sfgate")).length);
