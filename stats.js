// Pure stat/date helpers shared by content scripts, the popup, the
// background service worker, and the node test harness.
(function () {
  const S = {};

  const pad = (n) => String(n).padStart(2, "0");

  S.todayKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  };

  // Consecutive days with >=1 review, ending today (or yesterday if the user
  // hasn't reviewed yet today — an unfinished today shouldn't kill the streak).
  S.computeStreak = function (days, today) {
    const d = today ? new Date(today) : new Date();
    if (!days[S.todayKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days[S.todayKey(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  };

  // Longest run of consecutive review days, ever.
  S.bestStreak = function (days) {
    const keys = Object.keys(days).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of keys) {
      if (prev) {
        const d = new Date(prev + "T12:00:00");
        d.setDate(d.getDate() + 1);
        cur = S.todayKey(d) === k ? cur + 1 : 1;
      } else {
        cur = 1;
      }
      if (cur > best) best = cur;
      prev = k;
    }
    return best;
  };

  // Last n days as [{key, r, k}], oldest first. r = reviews, k = knew.
  S.lastNDays = function (days, n, today) {
    const out = [];
    const d = today ? new Date(today) : new Date();
    d.setDate(d.getDate() - (n - 1));
    for (let i = 0; i < n; i++) {
      const key = S.todayKey(d);
      out.push({ key, r: days[key]?.r || 0, k: days[key]?.k || 0 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  // Mastery tier from the frequency weight.
  // known: weight driven down to <=0.25 ("knew it" at least twice net)
  // tricky: weight driven up to >=2 ("didn't" at least once net)
  S.mastery = function (weight, seen) {
    if (!seen) return "new";
    if (weight <= 0.25) return "known";
    if (weight >= 2) return "tricky";
    return "learning";
  };

  S.summarize = function (weights, stats, vocabLen) {
    let totalReviews = 0, totalKnew = 0;
    for (const k in stats.days) {
      totalReviews += stats.days[k].r;
      totalKnew += stats.days[k].k;
    }
    let known = 0, tricky = 0, learning = 0, seen = 0;
    for (const i in stats.words) {
      seen++;
      const m = S.mastery(weights[i] ?? 1, true);
      if (m === "known") known++;
      else if (m === "tricky") tricky++;
      else learning++;
    }
    return {
      totalReviews,
      accuracy: totalReviews ? totalKnew / totalReviews : 0,
      known, tricky, learning,
      unseen: Math.max(0, vocabLen - seen),
    };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = S;
  if (typeof window !== "undefined") {
    window.MZH = window.MZH || {};
    window.MZH.stats = S;
  } else if (typeof self !== "undefined") {
    self.MZHStats = S; // MV3 service worker (importScripts)
  }
})();
