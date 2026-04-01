/**
 * ADSPY INTELLIGENCE — Backend v3.0
 * ==================================
 * Maneja CORS para:
 * - Anthropic Claude API (todos los módulos)
 * - Meta Ad Library API (marcas escaladas)
 *
 * DEPLOY EN RENDER.COM:
 * 1. Subí server.js + package.json al repo de GitHub
 * 2. New Web Service → seleccioná el repo
 * 3. Build Command: (vacío)
 * 4. Start Command: node server.js
 * 5. Plan: Free
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

const PORT = process.env.PORT || 3001;

// Tu API key de Anthropic — podés setearla como variable de entorno en Render
// O dejar que el frontend la pase en el header (más flexible)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');
}

function sendJSON(res, status, obj) {
  setCORS(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function httpsGet(targetUrl) {
  return new Promise(function(resolve, reject) {
    var req = https.get(targetUrl, function(r) {
      var body = '';
      r.on('data', function(chunk) { body += chunk; });
      r.on('end', function() { resolve(body); });
      r.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(new Error('Timeout')); });
  });
}

function httpsPost(hostname, path, headers, bodyStr) {
  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: hostname,
      port: 443,
      path: path,
      method: 'POST',
      headers: headers
    };
    var req = https.request(opts, function(r) {
      var body = '';
      r.on('data', function(chunk) { body += chunk; });
      r.on('end', function() { resolve({ status: r.statusCode, body: body }); });
      r.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(60000, function() { req.destroy(new Error('Timeout Claude API')); });
    req.write(bodyStr);
    req.end();
  });
}

function readBody(req) {
  return new Promise(function(resolve, reject) {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() { resolve(body); });
    req.on('error', reject);
  });
}

var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var path   = parsed.pathname;
  var query  = parsed.query;

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    setCORS(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Health check ──
  if (path === '/' || path === '/health') {
    return sendJSON(res, 200, { status: 'ok', service: 'AdSpy API', version: '3.0' });
  }

  // ── Claude API proxy ──
  // POST /api/claude  body: mismo formato que Anthropic API
  // Header x-api-key: tu API key de Anthropic (la pasa el frontend)
  if (path === '/api/claude' && req.method === 'POST') {
    readBody(req).then(function(bodyStr) {
      var apiKey = req.headers['x-api-key'] || ANTHROPIC_KEY;
      if (!apiKey) return sendJSON(res, 400, { error: { message: 'Falta x-api-key header' } });

      var headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(bodyStr)
      };

      httpsPost('api.anthropic.com', '/v1/messages', headers, bodyStr)
        .then(function(result) {
          setCORS(res);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(result.body);
        })
        .catch(function(err) {
          sendJSON(res, 500, { error: { message: 'Error Claude: ' + err.message } });
        });
    }).catch(function(err) {
      sendJSON(res, 500, { error: { message: 'Error leyendo body: ' + err.message } });
    });
    return;
  }

  // ── Meta Ad Library ──
  if (path === '/api/meta') {
    var token   = query.token;
    var country = query.country || 'AR';
    var q       = query.q;
    var limit   = query.limit || '100';

    if (!token) return sendJSON(res, 400, { error: { message: 'Falta token' } });
    if (!q)     return sendJSON(res, 400, { error: { message: 'Falta keyword (q)' } });

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
      catch(e) { return sendJSON(res, 502, { error: { message: 'Respuesta inválida de Meta' } }); }

      if (data.error) {
        var msg  = data.error.message || '';
        var code = data.error.code    || 0;
        if (code === 190 || msg.toLowerCase().indexOf('token') !== -1) {
          return sendJSON(res, 401, { error: { message: 'Token inválido o expirado' } });
        }
        if (code === 17 || msg.toLowerCase().indexOf('rate') !== -1) {
          return sendJSON(res, 429, { error: { message: 'Rate limit de Meta' } });
        }
        return sendJSON(res, 400, { error: { message: msg } });
      }
      return sendJSON(res, 200, data);
    }).catch(function(err) {
      sendJSON(res, 500, { error: { message: 'Error: ' + err.message } });
    });
    return;
  }

  // ── Meta fotos ──
  if (path === '/api/meta-photos') {
    var token2 = query.token;
    var ids    = query.ids;
    if (!token2 || !ids) return sendJSON(res, 400, { error: 'Faltan parámetros' });

    var photoUrl = 'https://graph.facebook.com/v19.0/?ids=' +
      encodeURIComponent(ids) +
      '&fields=picture.type(large)&access_token=' +
      encodeURIComponent(token2);

    httpsGet(photoUrl).then(function(body) {
      try { return sendJSON(res, 200, JSON.parse(body)); }
      catch(e) { return sendJSON(res, 502, { error: 'Respuesta inválida' }); }
    }).catch(function(err) {
      sendJSON(res, 500, { error: err.message });
    });
    return;
  }

  return sendJSON(res, 404, { error: 'Ruta no encontrada: ' + path });
});

server.listen(PORT, function() {
  console.log('');
  console.log('================================');
  console.log('  AdSpy Intelligence API v3.0');
  console.log('  Puerto: ' + PORT);
  console.log('  POST /api/claude  → Claude proxy');
  console.log('  GET  /api/meta    → Meta Ad Library');
  console.log('================================');
  console.log('');
});
