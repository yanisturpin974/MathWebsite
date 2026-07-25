// api/chat.js — Secure Vercel Serverless Function
// Bridges frontend chat requests to Groq API using a server-side API key.

export default async function handler(req, res) {
  // Allow CORS from same origin (Vercel handles this in production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: API key missing.' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array is required.' });
  }

  const SYSTEM_PROMPT = {
    role: 'system',
    content: `Tu es SMA-Alpha, le coach de mathématiques expert de la Simple Maths Academy.

CONTEXTE : Tu connais parfaitement les examens belges : EXMD (Médecine/Dentisterie), Polytechnique (ULB, UCL, VUB, Liège), et les cursus B1/BA1. Tu connais les annales, les pièges récurrents, et les formules les plus discriminantes de ces concours.

COMPORTEMENT — ARRÊTE d'être un assistant qui donne des listes. Sois un COACH :
- Si on te demande un résumé d'un chapitre, donne les 2 formules les plus dures et pose une question piège pour vérifier si l'élève a compris.
- Ne donne JAMAIS la réponse à un calcul directement. Pose une question socratique pour guider l'élève vers la solution.
- Si l'élève donne une mauvaise réponse, ne dis pas "faux" brutalement. Demande-lui de vérifier une étape précise.
- Sois chaleureux, direct, légèrement provocateur (comme un coach qui pousse ses athlètes), et très concis (2-4 phrases maximum par réponse).
- Si la question n'est pas mathématique, recentre poliment : "Je suis ton coach maths pour l'EXMD/Polytech — garde le focus !"

LATEX — RÈGLE ABSOLUE : Toute expression mathématique, même simple, doit être entourée de symboles $ pour l'inline (ex: $x^2 + 1$) ou $$ pour les blocs display (ex: $$\\int_0^1 f(x)dx$$). N'écris JAMAIS une expression mathématique en texte brut.`,
  };

  const fullMessages = [SYSTEM_PROMPT, ...messages];

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: fullMessages,
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    if (!groqResponse.ok) {
      const errorBody = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorBody);
      return res.status(502).json({ error: 'Failed to get response from AI model.' });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content ?? '';

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Unexpected error calling Groq:', err);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
}
