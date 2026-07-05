// Dev-only test harness (not part of the extension).
// Runs the real content scripts in jsdom with a stubbed chrome API.
// Usage: npm install --no-save jsdom && node run-tests.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const vocabJson = read("data/vocab.json");

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  PASS", msg); }
  else { failed++; console.log("  FAIL", msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <ins class="adsbygoogle" id="banner" style="width:728px;height:90px;"></ins>
    <ins class="adsbygoogle" id="rect" style="width:300px;height:250px;"></ins>
    <div id="div-gpt-ad-123-0" style="width:336px;height:280px;"></div>
    <iframe id="google_ads_iframe_/1/x_0" width="320" height="50"></iframe>
    <ins class="adsbygoogle" id="tiny" style="width:1px;height:1px;"></ins>
    <div id="late-target"></div>
  </body></html>`, { runScripts: "outside-only", pretendToBeVisual: true });

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

  // chrome API stub
  const storageData = {};
  window.chrome = {
    runtime: { getURL: (p) => "ext://" + p },
    storage: {
      local: {
        get: async (key) => ({ [key]: storageData[key] }),
        set: async (obj) => Object.assign(storageData, obj),
      },
    },
  };
  window.fetch = async (url) => {
    assert(url === "ext://data/vocab.json", "vocab fetched via chrome.runtime.getURL");
    return { json: async () => JSON.parse(vocabJson) };
  };

  // Run the real content scripts in load order.
  for (const f of ["selectors.js", "vocab.js", "flashcard.js", "content.js"]) {
    window.eval(read(f));
  }
  await sleep(300); // let initial scan + MZH.ready + card population settle

  console.log("\n[replacement]");
  const doc = window.document;
  assert(!doc.getElementById("banner"), "728x90 ins.adsbygoogle removed");
  assert(!doc.getElementById("rect"), "300x250 ins.adsbygoogle removed");
  assert(!doc.getElementById("div-gpt-ad-123-0"), "GPT container removed");
  assert(!doc.querySelector("iframe"), "cross-origin ad iframe removed (replaced from parent)");
  assert(doc.getElementById("tiny"), "1x1 tracking pixel NOT replaced");
  const cards = [...doc.querySelectorAll("[data-mzh-card]")];
  assert(cards.length === 4, `4 cards injected (got ${cards.length})`);

  console.log("\n[dimensions]");
  const sizes = cards.map((c) => c.style.width + "x" + c.style.height);
  assert(sizes.includes("728pxx90px"), "banner slot dimensions preserved (728x90)");
  assert(sizes.includes("300pxx250px"), "rectangle slot dimensions preserved (300x250)");
  assert(sizes.includes("320pxx50px"), "iframe attribute dimensions preserved (320x50)");

  console.log("\n[layout by aspect ratio]");
  const rootOf = (card) => shadowRoots.get(card).querySelector(".root");
  const bannerCard = cards.find((c) => c.style.width === "728px");
  const rectCard = cards.find((c) => c.style.width === "300px");
  assert(rootOf(bannerCard).classList.contains("banner"), "728x90 uses banner word strip");
  assert(rootOf(rectCard).classList.contains("card"), "300x250 uses full flashcard");

  console.log("\n[flashcard behavior]");
  const root = rootOf(rectCard);
  const shadow = shadowRoots.get(rectCard);
  const hanzi1 = shadow.querySelector(".hanzi").textContent;
  assert(hanzi1.length > 0, "card shows a hanzi word: " + hanzi1);
  assert(shadow.querySelector(".answer").style.display === "none", "answer hidden before flip");
  root.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert(shadow.querySelector(".answer").style.display !== "none", "tap flips card, answer shown");
  assert(shadow.querySelector(".pinyin").textContent.length > 0, "pinyin shown: " + shadow.querySelector(".pinyin").textContent);
  assert(shadow.querySelector(".english").textContent.length > 0, "english shown: " + shadow.querySelector(".english").textContent);

  console.log("\n[weight adjustment]");
  shadow.querySelector(".btn.knew").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(50);
  const weights = storageData.mzhWeights;
  const entries = Object.entries(weights || {});
  assert(entries.length === 1 && entries[0][1] === 0.5, "'knew it' halved weight to 0.5 and persisted");
  assert(shadow.querySelector(".answer").style.display === "none", "next word loaded, back to front side");
  // 'didn't' path
  root.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  shadow.querySelector(".btn.missed").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await sleep(50);
  assert(Object.values(storageData.mzhWeights).some((w) => w === 2), "'didn't' doubled a weight to 2");

  console.log("\n[MutationObserver: late-injected ad]");
  const late = doc.createElement("ins");
  late.className = "adsbygoogle";
  late.id = "late-ad";
  late.style.cssText = "width:300px;height:600px;";
  doc.getElementById("late-target").appendChild(late);
  await sleep(300);
  assert(!doc.getElementById("late-ad"), "late-injected ad replaced");
  assert(doc.querySelectorAll("[data-mzh-card]").length === 5, "5th card injected for late ad");

  console.log("\n[weighted pick sanity]");
  const MZH = window.MZH;
  const counts = {};
  for (let i = 0; i < 2000; i++) counts[MZH.pickWord().index] = (counts[MZH.pickWord().index] || 0) + 1;
  assert(Object.keys(counts).length > 50, "picker samples across the vocab");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
