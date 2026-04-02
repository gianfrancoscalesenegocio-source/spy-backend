const express = require('express');
const cors = require('cors');

const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
res.json({ status: "ok", scraper: "PRO activo" });
});

app.get('/api/meta-scraper', async (req, res) => {
const keyword = req.query.q || "ropa";

let browser;

try {
browser = await puppeteer.launch({
args: [
...chromium.args,
'--no-sandbox',
'--disable-setuid-sandbox'
],
defaultViewport: {
width: 1366,
height: 768
},
executablePath: await chromium.executablePath(),
headless: "new",
});

```
const page = await browser.newPage();

// USER AGENT REAL
await page.setUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
);

const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=AR&search_terms=${encodeURIComponent(keyword)}`;

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

// ESPERA HUMANA
await new Promise(r => setTimeout(r, 6000));

// SCROLL MÁS FUERTE
await page.evaluate(async () => {
  await new Promise((resolve) => {
    let totalHeight = 0;
    const distance = 1000;

    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      totalHeight += distance;

      if (totalHeight >= 10000) {
        clearInterval(timer);
        resolve();
      }
    }, 400);
  });
});

// EXTRAER DATOS
const data = await page.evaluate(() => {
  const cards = document.querySelectorAll('div[role="article"]');

  const brands = {};

  cards.forEach(card => {
    const text = card.innerText || "";
    const lines = text.split("\n");

    let brand = lines[0] || "Desconocida";

    if (!brands[brand]) {
      brands[brand] = {
        brand,
        ads: []
      };
    }

    brands[brand].ads.push({
      text: text.slice(0, 200)
    });
  });

  return Object.values(brands);
});

await browser.close();

// 🔥 FALLBACK (CLAVE)
if (!data || data.length === 0) {
  return res.json({
    success: true,
    fallback: true,
    message: "Facebook bloqueó parcialmente. Intentar nuevamente.",
    ads: []
  });
}

// FILTRO MARCAS ESCALADAS
const scaled = data.filter(b => b.ads.length >= 3);

res.json({
  success: true,
  totalBrands: data.length,
  scaledBrands: scaled.length,
  data: scaled.slice(0, 20)
});
```

} catch (err) {
if (browser) await browser.close();

```
res.status(500).json({
  success: false,
  error: err.message
});
```

}
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log("🚀 SCRAPER PRO corriendo en puerto " + PORT);
});
