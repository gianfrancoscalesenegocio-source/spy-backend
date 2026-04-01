/**
 * ADSPY INTELLIGENCE — Backend Meta Ad Library API v2.0
 * ======================================================
 * Usa el módulo https NATIVO de Node — sin dependencias externas.
 * Compatible con Node 14, 16, 18, 20+
 * CORS headers explícitos en TODAS las respuestas.
 *
 * DEPLOY EN RENDER.COM:
 * 1. Subí este server.js y el package.json al repo de GitHub
 * 2. Render → New Web Service → seleccioná el repo
 * 3. Build Command: npm install   (o dejarlo vacío — no hay deps)
 * 4. Start Command: node server.js
 * 5. Plan: Free
 * 6. Pegá la URL que te da Render en el campo "URL del backend" de la app
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

const PORT = process.env.PORT || 3001;

// CORS en todas las respuestas — sin esto el browser bloquea
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJSON(res, status, obj) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// GET HTTPS usando el módulo nativo (funciona en cualquier versión de Node)
function httpsGet(targetUrl) {
  return new Promise(function(resolve, reject) {
    var req = https.get(targetUrl, function(r) {
      var body = '';
      r.on('data', function(chunk) { body += chunk; });
      r.on('end',  function() { resolve(body); });
      r.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, function() {
      req.destroy(new Error('Timeout llamando a Meta API'));
    });
  });
}

var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var path   = parsed.pathname;
  var query  = parsed.query;

  // Preflight CORS — el browser lo manda antes de cualquier cross-origin request
  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (path === '/' || path === '/health') {
    return sendJSON(res, 200, { status: 'ok', service: 'AdSpy API', version: '2.0' });
  }

  // Meta Ad Library
  if (path === '/api/meta') {
    var token   = query.token;
    var country = query.country || 'AR';
    var q       = query.q;
    var limit   = query.limit  || '100';

    if (!token) return sendJSON(res, 400, { error: { message: 'Falta el token' } });
    if (!q)     return sendJSON(res, 400, { error: { message: 'Falta la keyword (q)' } });

    var params = [
      'access_token='         + encodeURIComponent(token),
      'ad_reached_countries=' + encodeURIComponent(country),
      'search_terms='         + encodeURIComponent(q),
      'ad_active_status=ACTIVE',
      'fields=page_name,page_id,ad_creative_bodies,ad_snapshot_url,spend,ad_delivery_start_time',
      'limit='                + limit
    ].join('&');

    var metaUrl = 'https://graph.facebook.com/v19.0/ads_archive?' + params;

    httpsGet(metaUrl).then(function(body) {
      var data;
      try { data = JSON.parse(body); }
      catch(e) { return sendJSON(res, 502, { error: { message: 'Respuesta inválida de Meta: ' + body.slice(0,200) } }); }

      if (data.error) {
        var msg  = data.error.message || '';
        var code = data.error.code    || 0;
        if (code === 190 || msg.toLowerCase().indexOf('token') !== -1 || msg.toLowerCase().indexOf('oauth') !== -1) {
          return sendJSON(res, 401, { error: { message: 'Token inválido o expirado. Regeneralo en developers.facebook.com/tools/explorer' } });
        }
        if (code === 17 || msg.toLowerCase().indexOf('rate') !== -1) {
          return sendJSON(res, 429, { error: { message: 'Rate limit de Meta. Esperá unos minutos.' } });
        }
        return sendJSON(res, 400, { error: { message: msg } });
      }

      return sendJSON(res, 200, data);

    }).catch(function(err) {
      console.error('[/api/meta] Error:', err.message);
      return sendJSON(res, 500, { error: { message: 'Error del servidor: ' + err.message } });
    });

    return; // evitar "headers already sent"
  }

  // Fotos de páginas
  if (path === '/api/meta-photos') {
    var token2 = query.token;
    var ids    = query.ids;
    if (!token2 || !ids) return sendJSON(res, 400, { error: 'Faltan token o ids' });

    var photoUrl = 'https://graph.facebook.com/v19.0/?ids=' +
      encodeURIComponent(ids) +
      '&fields=picture.type(large)&access_token=' +
      encodeURIComponent(token2);

    httpsGet(photoUrl).then(function(body) {
      try { return sendJSON(res, 200, JSON.parse(body)); }
      catch(e) { return sendJSON(res, 502, { error: 'Respuesta inválida' }); }
    }).catch(function(err) {
      return sendJSON(res, 500, { error: err.message });
    });

    return;
  }

  // 404
  return sendJSON(res, 404, { error: 'Ruta no encontrada: ' + path });
});

server.listen(PORT, function() {
  console.log('');
  console.log('=================================');
  console.log('  AdSpy Intelligence API v2.0');
  console.log('  Puerto: ' + PORT);
  console.log('  GET /               → health check');
  console.log('  GET /api/meta       → Meta Ad Library');
  console.log('  GET /api/meta-photos → fotos de páginas');
  console.log('=================================');
  console.log('');
});
