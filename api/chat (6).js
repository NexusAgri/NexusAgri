export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({error:'Method not allowed'}); return; }

  try {
    const { messages, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({error:'messages required'}); return;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) { res.status(500).json({error:'OPENROUTER_API_KEY not configured'}); return; }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'HTTP-Referer': 'https://ternak-os.vercel.app',
        'X-Title': 'TernakOS'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        max_tokens: max_tokens || 500,
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({error: errText}); return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
}
