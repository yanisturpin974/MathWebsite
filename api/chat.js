// api/chat.js — Vercel Serverless Function
// Google AI Studio — Gemini 2.0 Flash (REST v1beta)
// Supports: text chat + image Vision (Base64 inlineData)

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // ── API KEY ────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[api/chat] GEMINI_API_KEY manquante dans les variables Vercel');
    return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans les variables Vercel' });
  }

  // ── BODY VALIDATION ───────────────────────────────────────────────
  const { messages, imageBase64 } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages invalides : tableau non vide requis.' });
  }

  // ── SYSTEM PROMPT ─────────────────────────────────────────────────
  const SYSTEM_PROMPT = `Tu es SMA-Alpha, le professeur virtuel de mathématiques d'élite de Simple Maths Academy.

CONTEXTE : Tu connais parfaitement les examens belges : EXMD (Médecine/Dentisterie), Polytechnique (ULB, UCL, VUB, Liège), et les cursus B1/BA1. Tu connais les annales, les pièges récurrents, et les formules les plus discriminantes de ces concours.

COMPORTEMENT — Sois un COACH, pas un assistant qui donne des listes :
- Ne donne JAMAIS la réponse à un calcul directement. Pose une question socratique pour guider l'élève vers la solution.
- Si on te demande un résumé d'un chapitre, donne les 2 formules les plus dures et pose une question piège.
- Si l'élève donne une mauvaise réponse, demande-lui de vérifier une étape précise (ne dis pas "faux" brutalement).
- Sois chaleureux, direct, légèrement provocateur, et très concis (2-4 phrases maximum par réponse).
- Si la question n'est pas mathématique, recentre : "Je suis ton coach maths pour l'EXMD/Polytech — garde le focus !"
- Si une image d'exercice est fournie, analyse-la attentivement et guide l'élève socratiquement sur ce problème.

CONSIGNES STRICTES DE FORMATAGE MATHÉMATIQUE (LATEX) :
- Utilise les délimiteurs $ ... $ UNIQUEMENT pour les expressions et formules mathématiques (ex: $f(x) = x^2$).
- Ne place JAMAIS de mots français ou de phrases explicatives à l'intérieur des $ ... $.
- Exemple correct : "Voici l'intégrale $\\int_0^1 x\\,dx$ que nous allons calculer."
- Exemple INCORRECT : "$Voici l'intégrale \\int_0^1 x dx que nous allons calculer.$"
- Laisse toujours un espace avant et après une formule inline $ ... $.
- Pour les blocs display, utilise $$ ... $$ sur une ligne séparée.`;

  // ── CONVERT TO GEMINI FORMAT ──────────────────────────────────────
  // Gemini REST v1beta: role must be "user" or "model", parts: [{ text }]
  // IMPORTANT: inlineData (camelCase) — NOT inline_data (snake_case)
  const contents = messages.map((msg, idx) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [{ text: msg.content || '' }];

    // Attach image only to the last user message
    if (imageBase64 && idx === messages.length - 1 && msg.role !== 'assistant') {
      // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64,
        },
      });
    }

    return { role, parts };
  });

  // ── GEMINI API CALL ───────────────────────────────────────────────
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      console.error(`[api/chat] Gemini API ${geminiRes.status}:`, errorText);
      return res.status(geminiRes.status).json({
        error: `Erreur API Gemini (${geminiRes.status}) : ${errorText}`,
      });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      console.error('[api/chat] Réponse Gemini vide :', JSON.stringify(data));
      return res.status(502).json({
        error: "L'IA n'a pas pu générer de réponse. Réessaie dans quelques secondes.",
      });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('[api/chat] Erreur serveur inattendue :', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur interne' });
  }
}
