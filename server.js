/**
 * ADSPY INTELLIGENCE — Backend para Meta Ad Library API
 * =====================================================
 * Resuelve el error CORS: Meta bloquea requests desde browsers.
 * Este server corre en Node.js y hace las requests server-side.
 *
 * INSTRUCCIONES RÁPIDAS (Render.com — GRATIS):
 * 1. Creá cuenta en render.com
 * 2. New → Web Service → conectá tu repositorio (o subí los archivos)
 * 3. Build Command: npm install
 * 4. Start Command: node server.js
 * 5. Plan: Free
 * 6. La URL que te da Render (ej: https://adspy-api.onrender.com)
 *    pegala en el campo "URL del backend" de la app
 *
 * INSTRUCCIONES LOCAL (desarrollo):
 * 1. npm install express node-fetch cors
 * 2. node server.js
 * 3. Corre en http://localhost:3001
 * 4. Pegá http://localhost:3001 en el campo "URL del backend"
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Permitir requests desde cualquier origen (tu HTML puede estar en cualquier lado)
app.use(cors());
app.use(express.json());

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'AdSpy Intelligence API', version: '1.0' });
});

// ── Endpoint principal: Meta Ad Library ──
app.get('/api/meta', async (req, res) => {
  const { token, country, q, limit } = req.query;

  if (!token) return res.status(400).json({ error: { message: 'Token requerido' } });
  if (!q)     return res.status(400).json({ error: { message: 'Keyword requerida' } });

  try {
    // Node puede llamar a Meta sin problemas de CORS
    const params = new URLSearchParams({
      access_token: token,
      ad_reached_countries: country || 'AR',
      search_terms: q,
      ad_active_status: 'ACTIVE',
      fields: 'page_name,page_id,ad_creative_bodies,ad_snapshot_url,spend,ad_delivery_start_time',
      limit: limit || '100'
    });

    const metaUrl = `https://graph.facebook.com/v19.0/ads_archive?${params}`;

    // Usar fetch nativo (Node 18+) o node-fetch (Node 16-)
    let fetchFn;
    try {
      fetchFn = fetch; // Node 18+ tiene fetch nativo
    } catch(e) {
      fetchFn = require('node-fetch'); // fallback
    }

    const metaRes = await fetchFn(metaUrl);
    const data = await metaRes.json();

    // Manejar errores específicos de Meta
    if (data.error) {
      const msg = data.error.message || '';
      const code = data.error.code || 0;

      if (code === 190 || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('oauth')) {
        return res.status(401).json({
          error: { message: 'Token inválido o expirado. Regeneralo en developers.facebook.com/tools/explorer' }
        });
      }
      if (code === 17 || msg.toLowerCase().includes('rate limit')) {
        return res.status(429).json({
          error: { message: 'Rate limit de Meta API. Esperá unos minutos e intentá de nuevo.' }
        });
      }
      return res.status(400).json({ error: { message: msg } });
    }

    res.json(data);

  } catch (err) {
    console.error('Error llamando a Meta:', err.message);
    res.status(500).json({ error: { message: 'Error interno: ' + err.message } });
  }
});

// ── Endpoint de fotos de páginas ──
app.get('/api/meta-photos', async (req, res) => {
  const { token, ids } = req.query;
  if (!token || !ids) return res.status(400).json({ error: 'token e ids requeridos' });

  try {
    let fetchFn;
    try { fetchFn = fetch; } catch(e) { fetchFn = require('node-fetch'); }

    const url = `https://graph.facebook.com/v19.0/?ids=${encodeURIComponent(ids)}&fields=picture.type(large)&access_token=${encodeURIComponent(token)}`;
    const r = await fetchFn(url);
    const data = await r.json();
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ AdSpy API corriendo en http://localhost:${PORT}`);
  console.log(`   Endpoint Meta: http://localhost:${PORT}/api/meta?token=XXX&country=AR&q=envio+gratis`);
});
