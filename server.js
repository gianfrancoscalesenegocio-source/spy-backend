const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// Test de salud
app.get('/', (req, res) => {
  res.json({ status: 'ok', version: 'adspy-v4-backend-fixed' });
});

// Proxy para Claude
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

// Endpoint imagen → buyer persona
app.post('/buyer-persona-image', async (req, res) => {
  try {
    const { image } = req.body;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza esta foto de producto y genera buyer persona, upsells, hooks y ángulo de venta."
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: image
              }
            }
          ]
        }]
      })
    });

    const data = await claudeResponse.json();

    if (!data.content) {
      return res.status(500).json({ error: "Claude no respondió correctamente", raw: data });
    }

    res.json({ data: data.content[0].text });

  } catch (e) {
    console.error("ERROR IMAGE:", e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en puerto ${PORT}`);
});