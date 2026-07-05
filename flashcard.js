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
    }
    .hanzi { font-weight: 600; line-height: 1.1; }
    .pinyin { color: #b0413e; }
    .english { color: #5a4d3a; }
    .btn {
      border: none; border-radius: 6px; cursor: pointer;
      font-size: 13px; padding: 5px 10px; color: #fff;
    }
    .btn.knew { background: #4a8f5c; }
    .btn.missed { background: #c15b4e; }
    .btn:hover { filter: brightness(1.1); }
    .hint {
      position: absolute; bottom: 4px; right: 8px;
      font-size: 10px; color: #b3a184;
    }
    .tag {
      position: absolute; top: 4px; left: 8px;
      font-size: 9px; letter-spacing: 1px; color: #b3a184;
    }
    /* --- full card --- */
    .card { flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; padding: 12px; }
    .card .pinyin { font-size: 20px; }
    .card .english { font-size: 16px; }
    .buttons { display: flex; gap: 10px; margin-top: 6px; }
    /* --- banner strip --- */
    .banner { flex-direction: row; align-items: center; gap: 14px; padding: 0 14px; text-align: left; }
    .banner .answer { display: flex; flex-direction: column; justify-content: center; min-width: 0; flex: 1; }
    .banner .pinyin { font-size: 15px; }
    .banner .english { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .banner .buttons { margin: 0 0 0 auto; }
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

  function setupCard(root, width, height) {
    const banner = isBanner(width, height);
    let word, revealed;

    const hanziEl = el("div", "hanzi");
    const answerEl = el("div", "answer");
    const pinyinEl = el("div", "pinyin");
    const englishEl = el("div", "english");
    answerEl.append(pinyinEl, englishEl);

    const buttonsEl = el("div", "buttons");
    const knewBtn = el("button", "btn knew", "\u2713 knew it");
    const missedBtn = el("button", "btn missed", "\u2717 didn't");
    buttonsEl.append(knewBtn, missedBtn);

    const tagEl = el("div", "tag", "HSK");
    const hintEl = el("div", "hint", "tap to flip");
    root.append(tagEl, hanziEl, answerEl, buttonsEl, hintEl);

    // Scale hanzi to the slot.
    const hanziSize = banner
      ? Math.min(height * 0.55, 42)
      : Math.min(height * 0.28, width * 0.22, 64);
    hanziEl.style.fontSize = hanziSize + "px";

    function next() {
      word = MZH.pickWord();
      revealed = false;
      render();
    }

    function render() {
      hanziEl.textContent = word.hanzi;
      pinyinEl.textContent = word.pinyin;
      englishEl.textContent = word.english;
      answerEl.classList.toggle("hidden", !revealed);
      buttonsEl.classList.toggle("hidden", !revealed);
      hintEl.textContent = revealed ? "" : "tap to flip";
      if (!banner) {
        // Full card: front shows only hanzi, back shows everything.
        hanziEl.style.display = "";
        answerEl.style.display = revealed ? "" : "none";
        buttonsEl.style.display = revealed ? "flex" : "none";
      }
    }

    root.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!revealed) {
        revealed = true;
        render();
      }
    });

    knewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      MZH.recordResult(word.index, true);
      next();
    });
    missedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      MZH.recordResult(word.index, false);
      next();
    });

    next();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
})();
