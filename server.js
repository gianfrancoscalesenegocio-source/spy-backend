/**
 * ADSPY INTELLIGENCE — Backend v4.0
 * ===================================
 * Scraping real de Meta Ad Library (sin API key de Meta)
 * + Proxy Claude API
 *
 * CÓMO FUNCIONA:
 * Meta Ad Library tiene un endpoint público no documentado que devuelve
 * anunciantes reales con sus ads. Lo consultamos server-side para evitar CORS.
 *
 * DEPLOY EN RENDER.COM:
 * Start Command: node server.js
 * Plan: Free
 */

const https = require('https');
const http  = require('http');
const url   = require('url');

const PORT = process.env.PORT || 3001;
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

function httpsGetFull(targetUrl, extraHeaders) {
  return new Promise(function(resolve, reject) {
    var parsed = url.parse(targetUrl);
    var opts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.path,
      method: 'GET',
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.facebook.com/ads/library/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
      }, extraHeaders || {})
    };
    var req = https.request(opts, function(r) {
      var body = '';
      r.on('data', function(chunk) { body += chunk; });
      r.on('end', function() { resolve({ status: r.statusCode, body: body, headers: r.headers }); });
      r.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(new Error('Timeout')); });
    req.end();
  });
}

function httpsPost(hostname, path, headers, bodyStr) {
  return new Promise(function(resolve, reject) {
    var opts = {
      hostname: hostname, port: 443, path: path, method: 'POST',
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

// ── Scraping real de Meta Ad Library (endpoint público) ──
// Meta expone un endpoint de búsqueda en la Ad Library que no requiere login
// Devuelve anunciantes reales con cantidad de ads activos
async function scrapeAdLibrary(country, keyword, minAds) {
  var results = [];

  // Endpoint 1: Ad Library search (público, sin auth)
  // Este endpoint es el que usa la interfaz web de facebook.com/ads/library
  var searchUrl = 'https://www.facebook.com/ads/library/async/search_ads/?' +
    'q=' + encodeURIComponent(keyword) +
    '&ad_type=all' +
    '&country=' + encodeURIComponent(country) +
    '&active_status=active' +
    '&media_type=all' +
    '&search_type=keyword_unordered' +
    '&start_date[min]=&start_date[max]=&end_date[min]=&end_date[max]=';

  try {
    var r1 = await httpsGetFull(searchUrl, {
      'x-requested-with': 'XMLHttpRequest',
      'x-fb-friendly-name': 'AdLibrarySearchResultsQuery'
    });

    if (r1.status === 200 && r1.body) {
      // Meta devuelve JSON con prefijo de seguridad "for (;;);"
      var clean = r1.body.replace(/^for\s*\(;;\);/, '').trim();
      try {
        var data = JSON.parse(clean);
        var ads = extractAdsFromPayload(data);
        for (var i = 0; i < ads.length; i++) {
          var ad = ads[i];
          if (ad.page_id && ad.page_name) {
            var existing = results.find(function(r) { return r.id === ad.page_id; });
            if (existing) {
              existing.count++;
              if (ad.ad_creative_bodies && ad.ad_creative_bodies.length) {
                existing.copies = existing.copies.concat(ad.ad_creative_bodies.slice(0, 1));
              }
            } else {
              results.push({
                name: ad.page_name,
                id: ad.page_id,
                count: 1,
                copies: ad.ad_creative_bodies ? ad.ad_creative_bodies.slice(0, 2) : [],
                startDate: ad.ad_delivery_start_time || null,
                spend: ad.spend || null
              });
            }
          }
        }
      } catch(e) {}
    }
  } catch(e) {}

  // Endpoint 2: Si endpoint 1 no dio resultados, usar endpoint alternativo
  if (results.length === 0) {
    var altUrl = 'https://www.facebook.com/ads/library/?' +
      'active_status=active' +
      '&ad_type=all' +
      '&country=' + encodeURIComponent(country) +
      '&q=' + encodeURIComponent(keyword) +
      '&search_type=keyword_unordered';

    try {
      var r2 = await httpsGetFull(altUrl);
      if (r2.status === 200 && r2.body) {
        // Extraer datos del HTML embebido en la página
        var pageData = extractFromHTML(r2.body);
        results = results.concat(pageData);
      }
    } catch(e) {}
  }

  // Filtrar por mínimo de ads y deduplicar
  var seen = {};
  var filtered = results.filter(function(r) {
    if (seen[r.id]) return false;
    seen[r.id] = true;
    return r.count >= (minAds || 1);
  });

  return filtered.sort(function(a, b) { return b.count - a.count; });
}

function extractAdsFromPayload(data) {
  var ads = [];
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.page_id && obj.page_name) { ads.push(obj); return; }
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    Object.values(obj).forEach(walk);
  }
  walk(data);
  return ads;
}

function extractFromHTML(html) {
  var results = [];
  // Buscar JSON embebido con datos de ads
  var patterns = [
    /"page_id":"(\d+)","page_name":"([^"]+)"/g,
    /"pageID":"(\d+)","pageName":"([^"]+)"/g
  ];
  var seen = {};
  patterns.forEach(function(pattern) {
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var pid = match[1], pname = match[2];
      if (!seen[pid]) {
        seen[pid] = true;
        results.push({ name: pname, id: pid, count: 1, copies: [], startDate: null, spend: null });
      } else {
        var ex = results.find(function(r) { return r.id === pid; });
        if (ex) ex.count++;
      }
    }
  });
  return results;
}

var server = http.createServer(function(req, res) {
  var parsed = url.parse(req.url, true);
  var path   = parsed.pathname;
  var query  = parsed.query;

  if (req.method === 'OPTIONS') {
    setCORS(res); res.writeHead(204); res.end(); return;
  }

  // Health check
  if (path === '/' || path === '/health') {
    return sendJSON(res, 200, { status: 'ok', service: 'AdSpy API', version: '4.0' });
  }

  // ── Claude API proxy ──
  if (path === '/api/claude' && req.method === 'POST') {
    readBody(req).then(function(bodyStr) {
      var apiKey = req.headers['x-api-key'] || ANTHROPIC_KEY;
      if (!apiKey) return sendJSON(res, 400, { error: { message: 'Falta x-api-key' } });
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
      sendJSON(res, 500, { error: { message: err.message } });
    });
    return;
  }

  // ── Meta Ad Library scraping (SIN API KEY) ──
  if (path === '/api/meta-scrape') {
    var country = query.country || 'AR';
    var keyword = query.q;
    var minAds  = parseInt(query.min_ads) || 1;

    if (!keyword) return sendJSON(res, 400, { error: { message: 'Falta keyword (q)' } });

    scrapeAdLibrary(country, keyword, minAds).then(function(results) {
      sendJSON(res, 200, { data: results, source: 'scrape', keyword: keyword });
    }).catch(function(err) {
      sendJSON(res, 500, { error: { message: err.message } });
    });
    return;
  }

  // ── Meta Ad Library API (con token de Meta) ──
  if (path === '/api/meta') {
    var token   = query.token;
    var country2 = query.country || 'AR';
    var q       = query.q;
    var limit   = query.limit || '200';

    if (!token) return sendJSON(res, 400, { error: { message: 'Falta token' } });
    if (!q)     return sendJSON(res, 400, { error: { message: 'Falta keyword (q)' } });

    var params = [
      'access_token='         + encodeURIComponent(token),
      'ad_reached_countries=' + encodeURIComponent(country2),
      'search_terms='         + encodeURIComponent(q),
      'ad_active_status=ACTIVE',
      'fields=page_name,page_id,ad_creative_bodies,ad_snapshot_url,spend,ad_delivery_start_time',
      'limit='                + limit
    ].join('&');

    var metaUrl = 'https://graph.facebook.com/v19.0/ads_archive?' + params;

    httpsGetFull(metaUrl).then(function(r) {
      var data;
      try { data = JSON.parse(r.body); }
      catch(e) { return sendJSON(res, 502, { error: { message: 'Respuesta inválida de Meta' } }); }

      if (data.error) {
        var msg  = data.error.message || '';
        var code = data.error.code    || 0;
        if (code === 190 || msg.toLowerCase().indexOf('token') !== -1)
          return sendJSON(res, 401, { error: { message: 'Token inválido o expirado' } });
        if (code === 17 || msg.toLowerCase().indexOf('rate') !== -1)
          return sendJSON(res, 429, { error: { message: 'Rate limit de Meta' } });
        return sendJSON(res, 400, { error: { message: msg } });
      }
      return sendJSON(res, 200, data);
    }).catch(function(err) {
      sendJSON(res, 500, { error: { message: err.message } });
    });
    return;
  }

  return sendJSON(res, 404, { error: 'Ruta no encontrada: ' + path });
});

server.listen(PORT, function() {
  console.log('');
  console.log('================================');
  console.log('  AdSpy Intelligence API v4.0');
  console.log('  Puerto: ' + PORT);
  console.log('  POST /api/claude      → Claude proxy');
  console.log('  GET  /api/meta-scrape → Meta scraping (sin token)');
  console.log('  GET  /api/meta        → Meta API (con token)');
  console.log('================================');
  console.log('');
});
