const express = require('express');
const cors = require('cors');

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

// TEST
app.get('/', (req, res) => {
  res.json({ status: "ok", scraper: "activo" });
});

// SCRAPER META ADS
app.get('/api/meta-scraper', async (req, res) => {
  const keyword = req.query.q || "ropa";

  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=AR&search_type=keyword_unordered&search_terms=${encodeURIComponent(keyword)}`;

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 0
    });

    // scroll para cargar más ads
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 800;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= 6000) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });

    const ads = await page.evaluate(() => {
      const results = [];

      const cards = document.querySelectorAll('div[role="article"]');

      cards.forEach(card => {
        const text = card.innerText || "";
        const lines = text.split("\n");

        let brand = "Desconocida";
        if (lines.length > 0) brand = lines[0];

        results.push({
          brand,
          text: text.slice(0, 300)
        });
      });

      return results.slice(0, 20);
    });

    await browser.close();

    res.json({
      success: true,
      ads
    });

  } catch (err) {
    if (browser) await browser.close();

    console.error("SCRAPER ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server corriendo en puerto " + PORT);
});