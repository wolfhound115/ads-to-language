// Service worker: shows today's review count as a toolbar badge.
importScripts("stats.js");
const S = self.MZHStats;

async function updateBadge() {
  try {
    const { mzhStats } = await chrome.storage.local.get("mzhStats");
    const n = mzhStats?.days?.[S.todayKey()]?.r || 0;
    await chrome.action.setBadgeBackgroundColor({ color: "#4a8f5c" });
    await chrome.action.setBadgeText({ text: n ? String(n) : "" });
  } catch (e) { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.mzhStats) updateBadge();
});
updateBadge();
