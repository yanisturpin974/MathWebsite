// api/chat.js — Vercel Serverless Function
// Uses Google AI Studio Gemini 2.0 Flash (multimodal: text + image Vision)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: API key missing.' });
  }

  const { messages, imageBase64 } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array is required.' });
  }

  const SYSTEM_INSTRUCTION = `Tu es SMA-Alpha, le coach de mathématiques expert de la Simple Maths Academy.

CONTEXTE : Tu connais parfaitement les examens belges : EXMD (Médecine/Dentisterie), Polytechnique (ULB, UCL, VUB, Liège), et les cursus B1/BA1. Tu connais les annales, les pièges récurrents, et les formules les plus discriminantes de ces concours.

COMPORTEMENT — ARRÊTE d'être un assistant qui donne des listes. Sois un COACH :
- Si on te demande un résumé d'un chapitre, donne les 2 formules les plus dures et pose une question piège pour vérifier si l'élève a compris.
- Ne donne JAMAIS la réponse à un calcul directement. Pose une question socratique pour guider l'élève vers la solution.
- Si l'élève donne une mauvaise réponse, ne dis pas "faux" brutalement. Demande-lui de vérifier une étape précise.
- Sois chaleureux, direct, légèrement provocateur (comme un coach qui pousse ses athlètes), et très concis (2-4 phrases maximum par réponse).
- Si la question n'est pas mathématique, recentre poliment : "Je suis ton coach maths pour l'EXMD/Polytech — garde le focus !"
- Si une image d'exercice est fournie, analyse-la attentivement et guide l'élève socratiquement sur ce problème spécifique.

LATEX — CONSIGNES STRICTES DE FORMATAGE MATHÉMATIQUE :
- Toute expression mathématique, même simple, doit être entourée de symboles $ pour l'inline (ex: $x^2 + 1$) ou $$ pour les blocs display (ex: $$\\int_0^1 f(x)dx$$). N'écris JAMAIS une expression mathématique en texte brut.
- Utilise les délimiteurs $ ... $ UNIQUEMENT pour les expressions, variables et formules mathématiques précises (ex: $f(x) = x^2$ ou $\\int_0^1 \\frac{1}{x^2+1}dx$).
- Ne place JAMAIS de mots français, de ponctuation ou de phrases explicatives à l'intérieur des délimiteurs $ ... $.
- Exemple correct : "Voici l'intégrale $\\int_0^1 x dx$ que nous allons calculer."
- Exemple INCORRECT : "$Voici l'intégrale \\int_0^1 x dx que nous allons calculer.$"
- Laisse toujours un espace avant et après une formule inline $ ... $.`;

  // Convert chat history to Gemini format (role: 'user' | 'model')
  const contents = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
    const isLastUserMsg = (i === messages.length - 1) && (msg.role === 'user');

    if (isLastUserMsg && imageBase64) {
      // Multimodal: text + image for last user message
      contents.push({
        role: 'user',
        parts: [
          { text: msg.content || 'Analyse cet exercice de mathématiques et guide-moi.' },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      });
    } else {
      contents.push({
        role: geminiRole,
        parts: [{ text: msg.content || '' }],
      });
    }
  }

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    generationConfig: {
      maxOutputTokens: 800,
      temperature: 0.7,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorBody);
      return res.status(502).json({ error: 'Failed to get response from AI model.' });
    }

    const data = await geminiResponse.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!reply) {
      console.error('Empty Gemini response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty response from AI model.' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Unexpected error calling Gemini:', err);
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  }
}

