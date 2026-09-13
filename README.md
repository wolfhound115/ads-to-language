# Ads to Mandarin

A Chrome extension that replaces online ads with Mandarin Chinese flashcards. Instead of blocking ads, it turns that space into bite-sized vocabulary practice using spaced repetition.

![HSK levels 1–3 · Manifest V3](https://img.shields.io/badge/HSK-1--3-red) ![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-blue)

---

## What it does

Every time a page loads an ad slot, the extension swaps it out for an interactive flashcard pulled from the HSK 1–3 vocabulary list (597 words). You flip the card, mark whether you knew it, and the extension remembers — showing trickier words more often over time.

**Features:**
- Spaced repetition — missed words come back more frequently
- Tracks streaks, daily goals, accuracy, and mastery per HSK level
- Cards show pinyin, example sentences, and an optional pronunciation button
- Works in Chinese→English or English→Chinese (or mixed) direction
- Stats dashboard in the popup with a 7-day review chart
- Export/import your progress as JSON
- Per-site toggle to disable on specific websites

---

## Installation

This extension isn't on the Chrome Web Store yet, so you'll load it manually — it only takes a minute.

1. **Download the code**
   - Click the green **Code** button on this page → **Download ZIP**
   - Unzip the folder somewhere you won't accidentally delete it (e.g. your Documents folder)

2. **Open Chrome extensions**
   - Go to `chrome://extensions` in your browser

3. **Enable Developer Mode**
   - Toggle **Developer mode** on in the top-right corner

4. **Load the extension**
   - Click **Load unpacked**
   - Select the unzipped folder (the one containing `manifest.json`)

5. **Pin it (optional but recommended)**
   - Click the puzzle piece icon in the Chrome toolbar → pin **Ads to Mandarin**

That's it. Browse any site with ads and flashcards will start appearing.

> **Note:** The extension scans for new ads at 1s, 3s, and 7s after page load to catch dynamically injected slots, so cards may appear a moment after the page loads.

---

## Settings

Click the extension icon to open the dashboard. Settings are in the panel at the bottom.

| Setting | Description |
|---|---|
| **Enabled** | Global on/off switch |
| **Deck** | Vocabulary level: HSK 1, 2, 3, 1+2, or 1+2+3 |
| **Direction** | Chinese→English, English→Chinese, or Mixed |
| **Pinyin on front** | Show pronunciation guide on the card front |
| **Pronunciation button** | 🔊 button reads the word aloud |
| **Example sentences** | Show a short example sentence (on taller cards) |
| **Daily goal** | How many reviews to aim for per day |
| **Max cards per page** | Cap on how many ads get replaced per page (default 12) |
| **This site** | Disable the extension on the current website only |

Settings sync across your Chrome devices if you're signed into Chrome.

---

## Progress & Stats

The popup dashboard shows:
- **Streak** — consecutive days with at least one review
- **Today** — reviews completed vs. your daily goal
- **Word status** — how many words are known, learning, tricky, or unseen
- **7-day chart** — daily review volume
- **Deck progress** — mastery bars per HSK level
- **Tricky words** — your top 5 hardest words (click to hear pronunciation)

Use **Export** to save a backup of all your progress, and **Import** to restore it.

---

## How the learning algorithm works

Each word has a weight that adjusts based on your answers:

| Response | Effect on weight |
|---|---|
| Knew it ✓ | Weight ÷ 2 (seen less often) |
| Fuzzy ~ | Weight × √2 (slight bump) |
| Didn't know ✗ | Weight × 2 (seen more often) |

Words are selected randomly in proportion to their weight, so harder words naturally surface more.
