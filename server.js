const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsed = url.parse(req.url, true);

  // TEST
  if (parsed.pathname === '/health') {
    return send(res, 200, { ok: true });
  }

  // BUYER PERSONA
  if (parsed.pathname === '/buyer-persona' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));

      if (!body.image) {
        return send(res, 400, { error: 'No image' });
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: body.image
                  }
                },
                {
                  type: "text",
                  text: "Analiza este producto y dame buyer persona completo con dolores, deseos, objeciones y hooks."
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();

      return send(res, 200, {
        ok: true,
        result: data.content?.[0]?.text
      });

    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});