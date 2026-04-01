const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY; // poné tu key de Anthropic aquí

// Test de salud
app.get('/', (req, res) => {
  res.json({ status: 'ok', version: 'adspy-v4-backend' });
});

// Proxy para Claude (todas las funciones del SaaS)
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
    res.status(500).json({ error: e.message });
  }
});

// Endpoint específico para "Todo desde foto" → Buyer Persona + Upsells
app.post('/buyer-persona-image', async (req, res) => {
  try {
    const { image } = req.body; // base64

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
            { type: "text", text: "Analiza esta foto de producto y genera:\n\n1. Buyer Persona detallado (edad, dolores, deseos, objeciones)\n2. 5 Upsells / Cross-sells lógicos con copy listo para usar\n3. Hooks de venta para Meta Ads\n4. Sugerencia de ángulo de venta ganador\nSé específico y directo." },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }
          ]
        }]
      })
    });

    const data = await claudeResponse.json();
    const text = data.content[0].text;

    res.json({ data: text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ AdSpy Backend v4 corriendo en puerto ${PORT}`));