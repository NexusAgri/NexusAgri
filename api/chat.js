// ─────────────────────────────────────────────────────────────────
// NexusAgri · /api/chat.js
// AI Engine: OpenRouter FREE Models — Zero cost, no credit card
// Primary:  google/gemini-2.0-flash-exp:free  (best free model)
// Fallback: meta-llama/llama-3.1-8b-instruct:free
//           qwen/qwen-2.5-7b-instruct:free
//           mistralai/mistral-7b-instruct:free
// ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_KEY) {
    return res.status(500).json({
      error: 'OPENROUTER_API_KEY belum diset. Masuk ke Vercel → Settings → Environment Variables → tambah OPENROUTER_API_KEY.'
    });
  }

  // Free models — urutan priority (auto-fallback jika rate limit)
  const FREE_MODELS = [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'qwen/qwen-2.5-7b-instruct:free',
    'google/gemini-flash-1.5-8b:free',
    'mistralai/mistral-7b-instruct:free',
  ];

  try {
    const { messages, max_tokens, model: requestedModel } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const DEFAULT_SYSTEM = `Kamu adalah Omega Intelligence — AI konsultan ekosistem hayati & kecerdasan bumi milik NexusAgri. Born in Mojosari, Mojokerto — Built for the World.

IDENTITAS: Konsultan senior yang menggabungkan kepakaran dokter hewan, agronomist, analis pasar, dan financial advisor.

CARA MENJAWAB:
- Langsung ke inti, tidak bertele-tele
- Berikan angka nyata: harga pasar, dosis, waktu, bobot
- Contoh dari lapangan Indonesia (Jawa Timur prioritas)
- Tutup dengan 1 aksi konkret yang bisa dilakukan HARI INI
- Max 350 kata kecuali diminta lebih panjang

KEAHLIAN: Ternak (sapi, kambing, domba, kerbau), Unggas (ayam broiler/layer/kampung, bebek, puyuh), Aquaculture (lele, nila, udang vaname, gurame), Pertanian (padi, jagung, kedelai), Hortikultura (cabai, tomat, bawang merah/putih), Perkebunan (sawit, karet, kopi, kakao), Insekta (maggot BSF, lebah, jangkrik), Tanaman Obat (jahe, kunyit, temulawak).

JANGAN: Jawab tergantung tanpa range. Buat angka jika tidak tahu — katakan "cek harga terkini di Market Intelligence".`;

    let systemContent = DEFAULT_SYSTEM;
    let chatMessages = messages;
    if (messages[0]?.role === 'system') {
      systemContent = messages[0].content;
      chatMessages = messages.slice(1);
    }

    const maxTok = max_tokens || 800;
    const formattedMessages = [
      { role: 'system', content: systemContent },
      ...chatMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    ];

    const modelsToTry = requestedModel ? [requestedModel, ...FREE_MODELS] : FREE_MODELS;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://nexusagri.vercel.app',
            'X-Title': 'NexusAgri Omega Intelligence',
          },
          body: JSON.stringify({
            model,
            messages: formattedMessages,
            max_tokens: maxTok,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(25000)
        });

        if (response.status === 429) {
          console.warn(`${model} rate limited, trying next...`);
          lastError = 'Rate limited';
          continue;
        }

        if (response.status === 400 || response.status === 404) {
          lastError = `Model ${model} unavailable`;
          continue;
        }

        if (!response.ok) {
          lastError = `HTTP ${response.status}`;
          continue;
        }

        const data = await response.json();

        if (!data.choices?.[0]?.message?.content) {
          lastError = 'Empty response';
          continue;
        }

        return res.status(200).json({
          choices: [{
            message: {
              role: 'assistant',
              content: data.choices[0].message.content
            },
            finish_reason: data.choices[0].finish_reason || 'stop'
          }],
          model: data.model || model,
          usage: data.usage || {}
        });

      } catch (modelErr) {
        lastError = modelErr.message;
        continue;
      }
    }

    return res.status(503).json({
      error: 'AI sedang overload. Coba lagi dalam 1-2 menit.',
      detail: lastError
    });

  } catch (err) {
    console.error('api/chat error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
