// Popup: stats dashboard + settings.
const S = window.MZH.stats;
const DEFAULT_SETTINGS = {
  enabled: true,
  deck: "both",
  pinyinFront: false,
  audio: true,
  dailyGoal: 20,
  disabledSites: [],
};

let settings = { ...DEFAULT_SETTINGS };
let currentHost = null;

const $ = (id) => document.getElementById(id);

async function load() {
  const [local, sync, vocabRes, tabs] = await Promise.all([
    chrome.storage.local.get(["mzhWeights", "mzhStats"]),
    chrome.storage.sync.get("mzhSettings"),
    fetch("data/vocab.json"),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const weights = local.mzhWeights || {};
  const stats = local.mzhStats || { days: {}, words: {} };
  const vocab = await vocabRes.json();
  settings = { ...DEFAULT_SETTINGS, ...(sync.mzhSettings || {}) };

  try {
    const url = tabs[0]?.url;
    if (url && /^https?:/.test(url)) currentHost = new URL(url).hostname;
  } catch (e) { /* no usable tab URL */ }

  renderStats(weights, stats, vocab);
  renderSettings();
}

function renderStats(weights, stats, vocab) {
  const streak = S.computeStreak(stats.days);
  const best = S.bestStreak(stats.days);
  let streakText = streak > 0 ? `\uD83D\uDD25 ${streak} day${streak === 1 ? "" : "s"}` : "";
  if (best > streak) streakText += `${streakText ? " \u00b7 " : ""}best ${best}`;
  $("streak").textContent = streakText;

  const today = stats.days[S.todayKey()] || { r: 0, k: 0 };
  const goal = settings.dailyGoal;
  $("today-label").textContent = `${today.r} / ${goal} today`;
  const pct = Math.min(100, (today.r / goal) * 100);
  $("today-bar").style.width = pct + "%";
  $("today-bar").classList.toggle("done", today.r >= goal);

  const sum = S.summarize(weights, stats, vocab.length);
  $("accuracy").textContent = sum.totalReviews
    ? `${Math.round(sum.accuracy * 100)}% known \u00b7 ${sum.totalReviews} reviews`
    : "no reviews yet";
  $("n-known").textContent = sum.known;
  $("n-learning").textContent = sum.learning;
  $("n-tricky").textContent = sum.tricky;
  $("n-unseen").textContent = sum.unseen;

  // 7-day chart
  const days = S.lastNDays(stats.days, 7);
  const max = Math.max(1, ...days.map((d) => d.r));
  const chart = $("chart");
  chart.textContent = "";
  const todayKey = S.todayKey();
  for (const d of days) {
    const col = document.createElement("div");
    col.className = "col";
    const bar = document.createElement("div");
    bar.className = "colbar" + (d.key === todayKey ? " today" : "");
    bar.style.height = Math.round((d.r / max) * 100) + "%";
    bar.title = `${d.key}: ${d.r} reviews`;
    const label = document.createElement("div");
    label.className = "day";
    label.textContent = "SMTWTFS"[new Date(d.key + "T12:00:00").getDay()];
    col.append(bar, label);
    chart.appendChild(col);
  }

  // Tricky words (highest weights first)
  const tricky = Object.entries(weights)
    .filter(([, w]) => w >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  $("tricky-section").hidden = tricky.length === 0;
  const list = $("tricky-list");
  list.textContent = "";
  for (const [i] of tricky) {
    const word = vocab[i];
    if (!word) continue;
    const li = document.createElement("li");
    for (const [cls, text] of [["hz", word.hanzi], ["py", word.pinyin], ["en", word.english]]) {
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = text;
      li.appendChild(span);
    }
    list.appendChild(li);
  }
}

function renderSettings() {
  $("s-enabled").checked = settings.enabled;
  $("s-deck").value = settings.deck;
  $("s-pinyin").checked = settings.pinyinFront;
  $("s-audio").checked = settings.audio;
  $("s-goal").value = settings.dailyGoal;
  renderSiteButton();
}

function renderSiteButton() {
  const btn = $("s-site");
  if (!currentHost) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const disabled = (settings.disabledSites || []).includes(currentHost);
  btn.textContent = disabled
    ? `Enable on ${currentHost}`
    : `Disable on ${currentHost}`;
}

function save() {
  chrome.storage.sync.set({ mzhSettings: settings });
}

function bind() {
  $("s-enabled").addEventListener("change", (e) => { settings.enabled = e.target.checked; save(); });
  $("s-deck").addEventListener("change", (e) => { settings.deck = e.target.value; save(); });
  $("s-pinyin").addEventListener("change", (e) => { settings.pinyinFront = e.target.checked; save(); });
  $("s-audio").addEventListener("change", (e) => { settings.audio = e.target.checked; save(); });
  $("s-goal").addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    settings.dailyGoal = Number.isFinite(v) && v > 0 ? Math.min(v, 500) : 20;
    e.target.value = settings.dailyGoal;
    save();
    load(); // goal affects the progress bar
  });
  $("s-site").addEventListener("click", () => {
    if (!currentHost) return;
    const sites = new Set(settings.disabledSites || []);
    sites.has(currentHost) ? sites.delete(currentHost) : sites.add(currentHost);
    settings.disabledSites = [...sites];
    save();
    renderSiteButton();
  });
  $("reset").addEventListener("click", async () => {
    if (!confirm("Reset all learning progress (weights + stats)?")) return;
    await chrome.storage.local.remove(["mzhWeights", "mzhStats"]);
    load();
  });
}

bind();
load();
