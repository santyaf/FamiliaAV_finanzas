export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno del proyecto en Vercel.' });
    return;
  }
  try {
    const { system, content } = req.body || {};
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system,
        messages: [{ role: 'user', content }],
      }),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : 500).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al contactar la IA: ' + err.message });
  }
}
