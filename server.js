const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;

// health
app.get('/', (req, res) => {
  res.json({ status: 'ok', version: 'adspy-v5-scraper' });
});

// CLAUDE
app.post('/api/claude', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);

  } catch (e) {
    console.error("ERROR CLAUDE:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===============================
// 🔥 SCRAPER META ADS
// ===============================
const puppeteer = require("puppeteer");

app.get("/api/meta-scraper", async (req, res) => {
  const keyword = req.query.q || "ropa";

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=AR&search_type=keyword_unordered&search_terms=${encodeURIComponent(keyword)}`;

    await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

    await autoScroll(page);

    const ads = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('div[role="article"]');

      cards.forEach(card => {
        const text = card.innerText || "";
        results.push({ text: text.slice(0, 500) });
      });

      return results.slice(0, 15);
    });

    await browser.close();

    res.json({ success: true, ads });

  } catch (err) {
    if (browser) await browser.close();
    console.error("SCRAPER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 800;

      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= 5000) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend corriendo en puerto ${PORT}`);
});