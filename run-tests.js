// Dev-only test harness (not part of the extension).
// Runs the real content scripts in jsdom with a stubbed chrome API.
// Usage: npm install --no-save jsdom && node run-tests.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const vocabJson = read("data/vocab.json");
const vocab = JSON.parse(vocabJson);
const S = require("./stats.js");

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  PASS", msg); }
  else { failed++; console.log("  FAIL", msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LONG_TEXT = "This is real article content that happens to sit in a container with an ad-like class name. ".repeat(6);
const DEFAULT_HTML = `<!DOCTYPE html><html><body>
  <ins class="adsbygoogle" id="banner" style="width:728px;height:90px;"></ins>
  <ins class="adsbygoogle" id="rect" style="width:300px;height:250px;"></ins>
  <div id="div-gpt-ad-123-0" style="width:336px;height:280px;"></div>
  <iframe id="google_ads_iframe_/1/x_0" width="320" height="50"></iframe>
  <div class="ad-banner" id="easylist-hit" style="width:300px;height:250px;"></div>
  <div class="ad-banner" id="article" style="width:600px;height:400px;">${LONG_TEXT}</div>
  <div class="domain-rule-ad" id="domain-hit" style="width:300px;height:250px;"></div>
  <div class="other-domain-ad" id="other-domain" style="width:300px;height:250px;"></div>
  <ins class="adsbygoogle" id="tiny" style="width:1px;height:1px;"></ins>
  <div id="late-target"></div>
</body></html>`;

// Builds an isolated jsdom environment running the real content scripts.
async function makeEnv({ url = "https://example.com/", localData = {}, syncData = {} } = {}) {
  const dom = new JSDOM(DEFAULT_HTML, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;

  // jsdom doesn't do layout: derive getBoundingClientRect from inline style
  // or width/height attributes so the measurement code path is exercised.
  window.Element.prototype.getBoundingClientRect = function () {
    const w = parseFloat(this.style?.width) || parseFloat(this.getAttribute("width")) || 0;
    const h = parseFloat(this.style?.height) || parseFloat(this.getAttribute("height")) || 0;
    return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 };
  };

  // Capture closed shadow roots so tests can inspect card internals.
  const shadowRoots = new Map();
  const origAttach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function (init) {
    const root = origAttach.call(this, init);
    shadowRoots.set(this, root);
    return root;
  };

  const getAll = (data, keys) => {
    const out = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) out[k] = data[k];
    return out;
  };
  const changeListeners = [];
  window.chrome = {
    runtime: { getURL: (p) => "ext://" + p },
    storage: {
      local: {
        get: async (keys) => getAll(localData, keys),
        set: async (obj) => Object.assign(localData, obj),
        remove: async (keys) => (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete localData[k]),
      },
      sync: {
        get: async (keys) => getAll(syncData, keys),
        set: async (obj) => Object.assign(syncData, obj),
      },
      onChanged: { addListener: (fn) => changeListeners.push(fn) },
    },
  };
  window.fetch = async (url) => ({
    json: async () => JSON.parse(vocabJson),
    text: async () => (String(url).includes("easylist")
      ? read("data/easylist-snapshot.txt")
        + "\nexample.com##.domain-rule-ad\nother.org##.other-domain-ad\n"
      : ""),
  });

  for (const f of ["selectors.js", "stats.js", "vocab.js", "flashcard.js", "content.js"]) {
    window.eval(read(f));
  }
  await sleep(250); // initial scan + MZH.ready + card population

  return { window, doc: window.document, shadowRoots, localData, syncData, changeListeners };
}

const click = (window, el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

// Runs the real popup (popup.html + stats.js + popup.js) with stubbed chrome.
async function makePopupEnv({ localData = {}, syncData = {}, tabUrl = "https://news.site/article" } = {}) {
  const dom = new JSDOM(read("popup.html"), {
    url: "chrome-extension://abcdef/popup.html",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const getAll = (data, keys) => {
    const out = {};
    for (const k of Array.isArray(keys) ? keys : [keys]) out[k] = data[k];
    return out;
  };
  window.chrome = {
    storage: {
      local: {
        get: async (keys) => getAll(localData, keys),
        remove: async (keys) => (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete localData[k]),
      },
      sync: {
        get: async (keys) => getAll(syncData, keys),
        set: async (obj) => Object.assign(syncData, obj),
      },
    },
    tabs: { query: async () => [{ url: tabUrl }] },
  };
  window.fetch = async () => ({ json: async () => JSON.parse(vocabJson) });
  window.confirm = () => true;
  window.eval(read("stats.js"));
  window.eval(read("popup.js"));
  await sleep(50);
  return { window, doc: window.document, localData, syncData };
}

async function main() {
  // ---------- unit: stats helpers ----------
  console.log("[stats.js unit]");
  const t = new Date("2026-07-05T12:00:00");
  assert(S.todayKey(t) === "2026-07-05", "todayKey formats date");
  assert(S.computeStreak({ "2026-07-05": { r: 1 }, "2026-07-04": { r: 2 }, "2026-07-03": { r: 1 } }, t) === 3,
    "streak counts consecutive days");
  assert(S.computeStreak({ "2026-07-04": { r: 2 }, "2026-07-03": { r: 1 } }, t) === 2,
    "streak survives an unfinished today");
  assert(S.computeStreak({ "2026-07-01": { r: 2 } }, t) === 0, "broken streak is 0");
  const week = S.lastNDays({ "2026-07-05": { r: 3, k: 2 } }, 7, t);
  assert(week.length === 7 && week[6].r === 3 && week[0].r === 0, "lastNDays fills gaps, oldest first");
  assert(S.mastery(0.125, true) === "known" && S.mastery(4, true) === "tricky"
    && S.mastery(1, true) === "learning" && S.mastery(1, false) === "new", "mastery tiers");
  const sum = S.summarize({ 0: 0.25, 1: 4 }, { days: { a: { r: 10, k: 7 } }, words: { 0: {}, 1: {}, 2: {} } }, 300);
  assert(sum.totalReviews === 10 && sum.accuracy === 0.7 && sum.known === 1 && sum.tricky === 1
    && sum.learning === 1 && sum.unseen === 297, "summarize aggregates correctly");
  assert(S.bestStreak({ "2026-07-01": { r: 1 }, "2026-07-02": { r: 1 }, "2026-06-10": { r: 1 } }) === 2,
    "bestStreak finds longest historical run");
  assert(S.bestStreak({}) === 0, "bestStreak of empty history is 0");

  // ---------- unit: EasyList parser ----------
  console.log("\n[easylist parser]");
  const parsed = (() => {
    // evaluate selectors.js in a bare context to reach parseEasyList
    const w = new JSDOM("", { runScripts: "outside-only" }).window;
    w.chrome = { runtime: { getURL: (p) => p } };
    w.fetch = async () => ({ text: async () => "" });
    w.eval(read("selectors.js"));
    return w.MZH;
  })();
  const { generic, byDomain } = parsed.parseEasyList([
    "! comment",
    "##.ad-banner",
    "###ad-container",
    "||doubleclick.net^",
    "||ads.example.com^$third-party",
    "/banner/*/img^",
    "example.com##.site-specific",
    "a.com,b.com##.multi-domain",
    "~negated.com##.negated-rule",
    "sub.example.com##.sub-rule",
    "example.com#@#.ad-exception",
    "example.com#?#.extended:has(.x)",
    "  ##.padded-rule  ",
    "",
  ].join("\n"));
  assert(generic.length === 3 && generic.includes(".ad-banner") && generic.includes("#ad-container")
    && generic.includes(".padded-rule"), "generic: keeps only generic cosmetic rules");
  assert(byDomain["example.com"].includes(".site-specific"), "domain rules keyed by domain");
  assert(byDomain["a.com"].includes(".multi-domain") && byDomain["b.com"].includes(".multi-domain"),
    "comma domain lists split per domain");
  assert(!byDomain["negated.com"] && !("~negated.com" in byDomain), "negated domains dropped");
  assert(!JSON.stringify(byDomain).includes("exception") && !JSON.stringify(byDomain).includes("extended"),
    "exception (#@#) and extended (#?#) rules dropped");
  const hostRules = parsed.rulesForHost(byDomain, "sub.example.com");
  assert(hostRules.includes(".sub-rule") && hostRules.includes(".site-specific"),
    "rulesForHost matches exact host + parent domains");
  assert(parsed.rulesForHost(byDomain, "www.example.com").includes(".site-specific")
    && !parsed.rulesForHost(byDomain, "www.example.com").includes(".sub-rule"),
    "www subdomain gets parent-domain rules only");
  assert(parsed.rulesForHost(byDomain, "unrelated.net").length === 0, "unrelated host gets no domain rules");
  assert(parsed.batchSelectors(["a", "b", "c"], 2).join("|") === "a,b|c", "batches selectors");

  // ---------- replacement (defaults) ----------
  console.log("\n[replacement + layout]");
  const env = await makeEnv();
  const { window, doc, shadowRoots } = env;
  assert(!doc.getElementById("banner") && !doc.getElementById("rect")
    && !doc.getElementById("div-gpt-ad-123-0") && !doc.querySelector("iframe"),
    "all hardcoded ad slots replaced (incl. cross-origin iframe)");
  assert(!doc.getElementById("easylist-hit"), "EasyList rule (.ad-banner) replaced");
  assert(!doc.getElementById("domain-hit"), "domain-specific rule (example.com##) replaced on example.com");
  assert(doc.getElementById("other-domain"), "other site's domain rule NOT applied here");
  assert(doc.getElementById("article"), "text-heavy .ad-banner NOT replaced (false-positive guard)");
  assert(doc.getElementById("tiny"), "1x1 tracking pixel NOT replaced");
  const cards = [...doc.querySelectorAll("[data-mzh-card]")];
  assert(cards.length === 6, `6 cards injected (got ${cards.length})`);
  const wordIndices = new Set(cards.map((c) => {
    const hz = shadowRoots.get(c).querySelector(".hanzi").textContent;
    return vocab.findIndex((w) => w.hanzi === hz);
  }));
  assert(wordIndices.size === 6, "6 cards show 6 distinct words (active-word dedup)");
  const sizes = cards.map((c) => c.style.width + "x" + c.style.height);
  assert(sizes.includes("728pxx90px") && sizes.includes("300pxx250px") && sizes.includes("320pxx50px"),
    "slot dimensions preserved");
  const rootOf = (card) => shadowRoots.get(card).querySelector(".root");
  const bannerCard = cards.find((c) => c.style.width === "728px");
  const rectCard = cards.find((c) => c.style.width === "300px");
  assert(rootOf(bannerCard).classList.contains("banner"), "728x90 uses banner strip");
  assert(rootOf(rectCard).classList.contains("card"), "300x250 uses full flashcard");

  // ---------- flip + three-button flow ----------
  console.log("\n[flashcard behavior]");
  const shadow = shadowRoots.get(rectCard);
  const root = rootOf(rectCard);
  assert(shadow.querySelector(".hanzi").textContent.length > 0, "front shows hanzi");
  assert(shadow.querySelector(".front-pinyin").style.display === "none", "no pinyin on front by default");
  assert(shadow.querySelector(".answer").style.display === "none", "answer hidden before flip");
  assert(/HSK [12] \u00b7 0\/20/.test(shadow.querySelector(".tag").textContent), "tag shows level + 0/20 progress");
  click(window, root);
  assert(shadow.querySelector(".answer").style.display !== "none", "tap flips card");
  assert(root.classList.contains("flip"), "flip animation class applied");
  const btns = [...shadow.querySelectorAll(".buttons .btn")].map((b) => b.className);
  assert(btns.some((c) => c.includes("knew")) && btns.some((c) => c.includes("fuzzy"))
    && btns.some((c) => c.includes("missed")), "three answer buttons: knew / fuzzy / didn't");
  assert(btns.some((c) => c.includes("speak")), "pronunciation button present (audio on)");
  click(window, shadow.querySelector(".btn.speak"));
  assert(true, "speak click doesn't throw without speechSynthesis");

  // ---------- weights + stats recording ----------
  console.log("\n[weights + stats]");
  click(window, shadow.querySelector(".btn.knew"));
  await sleep(30);
  let weights = env.localData.mzhWeights;
  assert(Object.values(weights).includes(0.5), "'knew it' halved weight to 0.5");
  const today = S.todayKey();
  let stats = env.localData.mzhStats;
  assert(stats.days[today].r === 1 && stats.days[today].k === 1, "day stats: 1 review, 1 knew");
  assert(shadow.querySelector(".answer").style.display === "none", "next word loaded, back to front");
  assert(/1\/20/.test(shadow.querySelector(".tag").textContent), "tag progress advanced to 1/20");

  click(window, root);
  click(window, shadow.querySelector(".btn.fuzzy"));
  await sleep(30);
  weights = env.localData.mzhWeights;
  stats = env.localData.mzhStats;
  assert(Object.values(weights).some((w) => Math.abs(w - Math.SQRT2) < 1e-9), "'fuzzy' scaled weight by sqrt2");
  assert(stats.days[today].r === 2 && stats.days[today].f === 1, "day stats: fuzzy counted separately");

  click(window, root);
  click(window, shadow.querySelector(".btn.missed"));
  await sleep(30);
  assert(Object.values(env.localData.mzhWeights).includes(2), "'didn't' doubled weight to 2");
  assert(env.localData.mzhStats.days[today].r === 3, "3 reviews logged");

  // ---------- mastered moment ----------
  console.log("\n[mastered moment]");
  const MZH = window.MZH;
  let res = MZH.recordResult(299, "knew");
  assert(Math.abs(res.weight - 0.5) < 1e-9 && !res.mastered, "recordResult returns weight, not yet mastered");
  MZH.recordResult(299, "knew");
  res = MZH.recordResult(299, "knew");
  assert(res.weight === 0.125 && res.mastered, "third 'knew' hits min weight -> mastered=true");
  res = MZH.recordResult(299, "knew");
  assert(!res.mastered, "already-mastered word doesn't re-trigger");

  // ---------- MutationObserver ----------
  console.log("\n[late-injected ad]");
  const late = doc.createElement("ins");
  late.className = "adsbygoogle";
  late.id = "late-ad";
  late.style.cssText = "width:300px;height:600px;";
  doc.getElementById("late-target").appendChild(late);
  await sleep(300);
  assert(!doc.getElementById("late-ad") && doc.querySelectorAll("[data-mzh-card]").length === 7,
    "late ad replaced via MutationObserver");

  // ---------- settings: disabled globally ----------
  console.log("\n[settings]");
  const off = await makeEnv({ syncData: { mzhSettings: { enabled: false } } });
  assert(off.doc.querySelectorAll("[data-mzh-card]").length === 0
    && off.doc.getElementById("banner"), "enabled=false leaves the page untouched");

  // ---------- settings: per-site disable ----------
  const siteOff = await makeEnv({ syncData: { mzhSettings: { disabledSites: ["example.com"] } } });
  assert(siteOff.doc.querySelectorAll("[data-mzh-card]").length === 0, "disabledSites skips example.com");
  const siteOn = await makeEnv({ syncData: { mzhSettings: { disabledSites: ["other.com"] } } });
  assert(siteOn.doc.querySelectorAll("[data-mzh-card]").length === 6, "other disabled sites don't affect us");

  // ---------- settings: deck filter ----------
  const hsk1 = await makeEnv({ syncData: { mzhSettings: { deck: "hsk1" } } });
  let allHsk1 = true;
  for (let i = 0; i < 300; i++) if (hsk1.window.MZH.pickWord().hsk !== 1) allHsk1 = false;
  assert(allHsk1, "deck=hsk1 only picks HSK 1 words (300 samples)");
  const hsk2 = await makeEnv({ syncData: { mzhSettings: { deck: "hsk2" } } });
  let allHsk2 = true;
  for (let i = 0; i < 300; i++) if (hsk2.window.MZH.pickWord().hsk !== 2) allHsk2 = false;
  assert(allHsk2, "deck=hsk2 only picks HSK 2 words (300 samples)");
  const hsk3 = await makeEnv({ syncData: { mzhSettings: { deck: "hsk3" } } });
  let allHsk3 = true;
  for (let i = 0; i < 300; i++) if (hsk3.window.MZH.pickWord().hsk !== 3) allHsk3 = false;
  assert(allHsk3, "deck=hsk3 only picks HSK 3 words (300 samples)");
  const deckBoth = await makeEnv(); // default deck "both"
  let no3 = true;
  for (let i = 0; i < 500; i++) if (deckBoth.window.MZH.pickWord().hsk === 3) no3 = false;
  assert(no3, "default deck (HSK 1+2) never picks HSK 3 words (500 samples)");

  // ---------- settings: pinyin on front ----------
  const pf = await makeEnv({ syncData: { mzhSettings: { pinyinFront: true } } });
  const pfCard = pf.doc.querySelector("[data-mzh-card]");
  const pfShadow = pf.shadowRoots.get(pfCard);
  assert(pfShadow.querySelector(".front-pinyin").style.display !== "none"
    && pfShadow.querySelector(".front-pinyin").textContent.length > 0, "pinyinFront shows pinyin pre-flip");
  click(pf.window, pfShadow.querySelector(".root"));
  assert(pfShadow.querySelector(".front-pinyin").style.display === "none",
    "front pinyin hidden after flip (answer shows it)");

  // ---------- settings: audio off ----------
  const noAudio = await makeEnv({ syncData: { mzhSettings: { audio: false } } });
  const naShadow = noAudio.shadowRoots.get(noAudio.doc.querySelector("[data-mzh-card]"));
  assert(!naShadow.querySelector(".btn.speak"), "audio=false hides pronunciation button");

  // ---------- tier indicator ----------
  console.log("\n[tier indicator]");
  const tierEl = shadow.querySelector(".tier");
  assert(tierEl && ["new", "learning", "tricky", "known"].includes(tierEl.title),
    "tier dot present with tooltip: " + tierEl.title);

  // ---------- goal-reached moment ----------
  console.log("\n[goal toast]");
  const goalEnv = await makeEnv({ syncData: { mzhSettings: { dailyGoal: 1 } } });
  const gCard = goalEnv.doc.querySelector("[data-mzh-card]");
  const gShadow = goalEnv.shadowRoots.get(gCard);
  click(goalEnv.window, gShadow.querySelector(".root"));
  click(goalEnv.window, gShadow.querySelector(".btn.knew"));
  await sleep(30);
  const gToast = gShadow.querySelector(".toast");
  assert(gToast && gToast.textContent.includes("daily goal reached"),
    "hitting the daily goal shows a toast");
  await sleep(1200);
  assert(!gShadow.querySelector(".toast") && gShadow.querySelector(".hanzi").textContent,
    "toast clears and next word loads");

  // ---------- live settings ----------
  console.log("\n[live settings]");
  assert(env.changeListeners.length > 0, "content script listens for settings changes");
  env.changeListeners.forEach((fn) =>
    fn({ mzhSettings: { newValue: { deck: "hsk3" } } }, "sync"));
  assert(window.MZH.settings.deck === "hsk3", "settings update live without reload");
  let live3 = true;
  for (let i = 0; i < 100; i++) if (window.MZH.pickWord().hsk !== 3) live3 = false;
  assert(live3, "new picks immediately use the changed deck");
  env.changeListeners.forEach((fn) =>
    fn({ mzhSettings: { newValue: {} } }, "sync")); // restore defaults

  // ---------- keyboard support ----------
  console.log("\n[keyboard]");
  const kbEnv = await makeEnv();
  const kbShadow = kbEnv.shadowRoots.get(kbEnv.doc.querySelector("[data-mzh-card]"));
  const kbRoot = kbShadow.querySelector(".root");
  assert(kbRoot.tabIndex === 0, "card is focusable");
  const key = (k) => kbRoot.dispatchEvent(new kbEnv.window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  key("Enter");
  assert(kbShadow.querySelector(".answer").style.display !== "none" || !kbRoot.classList.contains("card"),
    "Enter flips the card");
  key("1");
  await sleep(30);
  assert(Object.values(kbEnv.localData.mzhWeights || {}).includes(0.5), "'1' answers knew-it");

  // ---------- compact mode on narrow banners ----------
  console.log("\n[compact banners]");
  const mobileBanner = cards.find((c) => c.style.width === "320px");
  const mbShadow = shadowRoots.get(mobileBanner);
  assert(mbShadow.querySelector(".btn.knew").textContent === "\u2713",
    "320x50: icon-only buttons");
  assert(!mbShadow.querySelector(".btn.speak"), "320x50: speak button dropped");
  assert(mbShadow.querySelector(".btn.knew").title === "knew it", "icon buttons keep tooltips");
  const wideBanner = shadowRoots.get(cards.find((c) => c.style.width === "728px"));
  assert(wideBanner.querySelector(".btn.knew").textContent.includes("knew it"),
    "728x90: full button labels");

  // ---------- weighted pick sanity ----------
  console.log("\n[weighted pick]");
  const counts = {};
  for (let i = 0; i < 2000; i++) counts[window.MZH.pickWord().index] = true;
  assert(Object.keys(counts).length > 50, "picker samples across the vocab");

  // ---------- popup dashboard ----------
  console.log("\n[popup]");
  const yesterday = new Date(Date.now() - 864e5);
  const pop = await makePopupEnv({
    localData: {
      mzhWeights: { 0: 0.125, 1: 4, 2: 8 },
      mzhStats: {
        days: {
          [S.todayKey()]: { r: 5, k: 3, f: 1 },
          [S.todayKey(yesterday)]: { r: 2, k: 2 },
        },
        words: { 0: { k: 3, m: 0 }, 1: { k: 0, m: 2 }, 2: { k: 0, m: 3 } },
      },
    },
    syncData: { mzhSettings: { dailyGoal: 10 } },
  });
  const pd = pop.doc;
  assert(pd.getElementById("streak").textContent.includes("2 days"), "popup shows 2-day streak");
  assert(pd.getElementById("today-label").textContent === "5 / 10 today", "today progress respects custom goal");
  assert(pd.getElementById("today-bar").style.width === "50%", "progress bar at 50%");
  assert(pd.getElementById("n-known").textContent === "1" && pd.getElementById("n-tricky").textContent === "2"
    && pd.getElementById("n-unseen").textContent === "594", "mastery grid counts");
  assert(pd.querySelectorAll("#chart .col").length === 7, "7-day chart rendered");
  assert(!pd.getElementById("tricky-section").hidden
    && pd.querySelectorAll("#tricky-list li").length === 2, "tricky words listed");
  assert(pd.getElementById("s-site").textContent === "Disable on news.site", "per-site button shows hostname");

  // settings interactions persist
  const deckSel = pd.getElementById("s-deck");
  deckSel.value = "hsk1";
  deckSel.dispatchEvent(new pop.window.Event("change", { bubbles: true }));
  assert(pop.syncData.mzhSettings.deck === "hsk1", "deck change saved to sync storage");
  click(pop.window, pd.getElementById("s-site"));
  await sleep(20);
  assert(pop.syncData.mzhSettings.disabledSites.includes("news.site"), "site disable saved");
  assert(pd.getElementById("s-site").textContent === "Enable on news.site", "site button flips label");
  click(pop.window, pd.getElementById("reset"));
  await sleep(50);
  assert(!pop.localData.mzhWeights && !pop.localData.mzhStats, "reset clears weights + stats");
  assert(pd.getElementById("today-label").textContent === "0 / 10 today", "popup re-renders after reset");

  // ---------- vocab data sanity ----------
  console.log("\n[vocab data]");
  assert(vocab.length === 597, `597 words (got ${vocab.length})`);
  assert(vocab.every((w) => w.hanzi && w.pinyin && w.english && [1, 2, 3].includes(w.hsk)),
    "every word has hanzi/pinyin/english/hsk");
  assert(vocab.filter((w) => w.hsk === 1).length === 150, "150 HSK1 words");
  assert(vocab.filter((w) => w.hsk === 2).length === 150, "150 HSK2 words");
  assert(vocab.filter((w) => w.hsk === 3).length === 297, "297 HSK3 words");
  assert(new Set(vocab.map((w) => w.hanzi)).size === vocab.length, "no duplicate hanzi");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
