// Flashcard rendering. Cards live in a shadow root so page CSS can't touch them.
window.MZH = window.MZH || {};

(() => {
  const MZH = window.MZH;

  // Banner layout for wide, short slots (728x90, 970x90, 320x50...).
  // Full flashcard for rectangles (300x250, 336x280, 300x600...).
  function isBanner(w, h) {
    return h < 130 || w / h > 3;
  }

  const SHARED_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .root {
      width: 100%; height: 100%;
      font-family: "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: linear-gradient(135deg, #fdf6ec, #f7ead5);
      border: 1px solid #e0cfae;
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      cursor: pointer;
      user-select: none;
      color: #3a2f22;
      position: relative;
      outline: none;
      transition: box-shadow 120ms ease;
    }
    .root:hover, .root:focus-visible { box-shadow: 0 2px 10px rgba(90, 70, 40, 0.18); }
    @media (prefers-color-scheme: dark) {
      .root { background: linear-gradient(135deg, #2b2620, #332c22); border-color: #4a4032; color: #e8ddc8; }
      .english { color: #c9b998; }
      .english.as-hanzi { color: #e8ddc8; }
      .front-pinyin, .pinyin { color: #d4756f; }
      .hint, .tag { color: #7a6a52; }
      .toast { background: rgba(43, 38, 32, 0.94); color: #6fae7e; }
      .toast .small { color: #a89878; }
    }
    .flip { animation: flipIn 180ms ease; }
    @keyframes flipIn {
      from { transform: rotateY(65deg) scale(0.98); opacity: 0.35; }
      to   { transform: none; opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) { .flip { animation: none; } }
    .hanzi { font-weight: 600; line-height: 1.1; }
    .pinyin { color: #b0413e; }
    .english { color: #5a4d3a; }
    .english.as-hanzi { color: #3a2f22; font-weight: 600; }
    .front-pinyin { color: #b0413e; opacity: 0.7; }
    .btn {
      border: none; border-radius: 6px; cursor: pointer;
      font-size: 12px; padding: 5px 9px; color: #fff; white-space: nowrap;
      transition: transform 80ms ease, filter 80ms ease;
    }
    .btn.knew { background: #4a8f5c; }
    .btn.fuzzy { background: #c99a2e; }
    .btn.missed { background: #c15b4e; }
    .btn.speak { background: #8a7a60; }
    .btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn:active { transform: scale(0.94); }
    .hint {
      position: absolute; bottom: 4px; right: 8px;
      font-size: 10px; color: #b3a184;
    }
    .tag {
      position: absolute; top: 4px; left: 8px;
      font-size: 9px; letter-spacing: 1px; color: #b3a184;
    }
    .tag.goal-done { color: #4a8f5c; }
    .tier {
      position: absolute; top: 6px; right: 8px;
      width: 7px; height: 7px; border-radius: 50%;
    }
    .tier.new { background: #d8c49a; }
    .tier.learning { background: #c99a2e; }
    .tier.tricky { background: #c15b4e; }
    .tier.known { background: #4a8f5c; }
    .toast {
      position: absolute; inset: 0; z-index: 2;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(253, 246, 236, 0.94);
      color: #4a8f5c; font-weight: 600;
      animation: flipIn 180ms ease;
    }
    .toast .big { font-size: 22px; }
    .toast .small { font-size: 12px; color: #8a7a60; margin-top: 4px; font-weight: 400; }
    /* --- full card --- */
    .card { flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; }
    .card .pinyin { font-size: 20px; }
    .card .english { font-size: 16px; }
    .card .front-pinyin { font-size: 15px; }
    .example {
      font-size: 12px; line-height: 1.4; color: #6a5a42;
      border-top: 1px dashed #dcc9a4; padding-top: 6px; margin-top: 2px;
      max-width: 100%;
    }
    .example .ex-zh { font-size: 14px; }
    .example .ex-en { opacity: 0.75; }
    @media (prefers-color-scheme: dark) {
      .example { color: #bfae90; border-top-color: #4a4032; }
    }
    .buttons { display: flex; gap: 8px; margin-top: 6px; align-items: center; }
    /* --- banner strip --- */
    /* Content is centered as one group; gap/typography are scaled per-slot
       inline so wide leaderboards don't leave dead space in the middle. */
    .banner { flex-direction: row; align-items: center; justify-content: center; padding: 0 16px; text-align: left; }
    .banner .answer { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
    .banner .english { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .banner .buttons { margin-top: 0; }
    .banner .toast { flex-direction: row; gap: 10px; }
    .hidden { visibility: hidden; }
  `;

  // Creates the replacement element synchronously (so callers can swap it into
  // the DOM immediately), then fills it in once the vocab is loaded.
  MZH.createCard = function (width, height) {
    const host = document.createElement("div");
    host.setAttribute("data-mzh-card", "");
    host.style.cssText = `display:inline-block;width:${width}px;height:${height}px;max-width:100%;vertical-align:top;`;

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = SHARED_CSS;
    shadow.appendChild(style);

    const root = document.createElement("div");
    root.className = "root " + (isBanner(width, height) ? "banner" : "card");
    shadow.appendChild(root);

    MZH.ready.then(() => setupCard(root, width, height));
    return host;
  };

  function speak(text) {
    try {
      if (typeof speechSynthesis === "undefined") return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      speechSynthesis.speak(u);
    } catch (e) { /* no TTS available */ }
  }

  function setupCard(root, width, height) {
    const banner = isBanner(width, height);
    // Narrow banners (320x50 mobile strips) can't fit labelled buttons.
    const compact = banner && width < 520;
    const settings = MZH.settings;
    let word, revealed, reverse = false, busy = false;

    const hanziEl = el("div", "hanzi");
    const frontPinyinEl = el("div", "front-pinyin");
    const answerEl = el("div", "answer");
    const pinyinEl = el("div", "pinyin");
    const englishEl = el("div", "english");
    answerEl.append(pinyinEl, englishEl);
    // Example sentence: only on full cards tall enough to fit it.
    const showExamples = settings.sentences !== false && !banner && height >= 220;
    const exampleEl = el("div", "example");
    const exZhEl = el("div", "ex-zh");
    const exEnEl = el("div", "ex-en");
    exampleEl.append(exZhEl, exEnEl);
    if (showExamples) answerEl.append(exampleEl);

    const buttonsEl = el("div", "buttons");
    const knewBtn = el("button", "btn knew", compact ? "\u2713" : "\u2713 knew it");
    const fuzzyBtn = el("button", "btn fuzzy", compact ? "~" : "~ fuzzy");
    const missedBtn = el("button", "btn missed", compact ? "\u2717" : "\u2717 didn't");
    knewBtn.title = "knew it";
    fuzzyBtn.title = "fuzzy";
    missedBtn.title = "didn't know";
    if (settings.audio && !compact) {
      const speakBtn = el("button", "btn speak", "\uD83D\uDD0A");
      speakBtn.title = "pronounce";
      speakBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        speak(word.hanzi);
      });
      buttonsEl.append(speakBtn);
    }
    buttonsEl.append(knewBtn, fuzzyBtn, missedBtn);

    const tagEl = el("div", "tag");
    const tierEl = el("div", "tier");
    const hintEl = el("div", "hint", "tap to flip");
    root.append(tagEl, tierEl, hanziEl, frontPinyinEl, answerEl, buttonsEl, hintEl);

    // Scale typography and spacing to the slot. Wider/taller strips get
    // bigger type and wider gaps instead of clustering everything left.
    let hanziFont, englishFont;
    if (banner) {
      hanziFont = Math.min(height * 0.6, width * 0.09, 52);
      englishFont = Math.min(height * 0.24, 17);
      pinyinEl.style.fontSize = Math.min(height * 0.3, 22) + "px";
      frontPinyinEl.style.fontSize = Math.min(height * 0.26, 18) + "px";
      root.style.gap = Math.round(Math.max(compact ? 8 : 14, Math.min(width * 0.06, 56))) + "px";
      if (compact) {
        for (const b of [knewBtn, fuzzyBtn, missedBtn]) b.style.padding = "4px 7px";
        hintEl.style.display = "none"; // no room; tap affordance is obvious enough
      }
    } else {
      hanziFont = Math.min(height * 0.28, width * 0.22, 64);
      englishFont = 0; // 0 = use the stylesheet size
    }
    // Reverse (en->zh) cards: English prompt on the front, hanzi as answer.
    const engFrontFont = banner ? Math.min(height * 0.28, 20) : Math.min(height * 0.12, 22);
    const hanziAnswerFont = banner ? Math.min(height * 0.45, 32) : Math.min(height * 0.16, 36);

    function updateTag() {
      const p = MZH.todayProgress();
      tagEl.textContent = `HSK ${word.hsk || ""} \u00b7 ${p.done}/${p.goal}`;
      tagEl.classList.toggle("goal-done", p.done >= p.goal);
      if (p.done >= p.goal) tagEl.textContent += " \u2713";
    }

    function next(animate) {
      if (word) MZH.activeWords.delete(word.index);
      word = MZH.pickWord();
      MZH.activeWords.add(word.index);
      revealed = false;
      const dir = settings.direction;
      reverse = dir === "en-zh" || (dir === "mixed" && Math.random() < 0.5);
      render(animate);
    }

    function render(animate) {
      hanziEl.textContent = reverse ? word.english : word.hanzi;
      hanziEl.style.fontSize = (reverse ? engFrontFont : hanziFont) + "px";
      frontPinyinEl.textContent = word.pinyin;
      pinyinEl.textContent = word.pinyin;
      englishEl.textContent = reverse ? word.hanzi : word.english;
      englishEl.classList.toggle("as-hanzi", reverse);
      englishEl.style.fontSize = reverse
        ? hanziAnswerFont + "px"
        : (englishFont ? englishFont + "px" : "");
      if (showExamples) {
        exampleEl.style.display = word.ex ? "" : "none";
        exZhEl.textContent = word.ex ? word.ex.zh : "";
        exEnEl.textContent = word.ex ? word.ex.en : "";
      }
      updateTag();
      const tier = MZH.tierOf(word.index);
      tierEl.className = "tier " + tier;
      tierEl.title = tier;

      const showFrontPinyin = settings.pinyinFront && !revealed && !reverse;
      frontPinyinEl.style.display = showFrontPinyin ? "" : "none";
      hintEl.textContent = revealed ? "" : "tap to flip";
      if (banner) {
        // visibility keeps the centered layout from jumping on reveal
        answerEl.classList.toggle("hidden", !revealed);
        buttonsEl.classList.toggle("hidden", !revealed);
      } else {
        answerEl.style.display = revealed ? "" : "none";
        buttonsEl.style.display = revealed ? "flex" : "none";
      }

      if (animate) {
        root.classList.remove("flip");
        void root.offsetWidth; // restart the animation
        root.classList.add("flip");
      }
    }

    function showToast(big, small) {
      busy = true;
      const toast = el("div", "toast");
      toast.append(el("div", "big", big), el("div", "small", small));
      root.appendChild(toast);
      setTimeout(() => {
        toast.remove();
        busy = false;
        next(true);
      }, 1100);
    }

    function answer(result) {
      if (busy) return;
      const { mastered } = MZH.recordResult(word.index, result);
      const p = MZH.todayProgress();
      if (mastered) {
        showToast("\u2728 " + word.hanzi, "mastered \u00b7 " + word.english);
      } else if (p.done === p.goal) {
        // fires exactly once per day, on whichever card crosses the goal
        showToast("\uD83C\uDFAF " + p.goal + " reviews", "daily goal reached!");
      } else {
        next(true);
      }
    }

    function flip() {
      if (!revealed && !busy) {
        revealed = true;
        render(true);
      }
    }

    root.addEventListener("click", (e) => {
      e.stopPropagation();
      flip();
    });

    // Keyboard: Enter/Space flips; 1/2/3 answer once revealed.
    root.tabIndex = 0;
    root.addEventListener("keydown", (e) => {
      if (busy) return;
      if (!revealed && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        flip();
      } else if (revealed) {
        if (e.key === "1") answer("knew");
        else if (e.key === "2") answer("fuzzy");
        else if (e.key === "3") answer("missed");
      }
    });
    knewBtn.addEventListener("click", (e) => { e.stopPropagation(); answer("knew"); });
    fuzzyBtn.addEventListener("click", (e) => { e.stopPropagation(); answer("fuzzy"); });
    missedBtn.addEventListener("click", (e) => { e.stopPropagation(); answer("missed"); });

    next(false);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
})();
