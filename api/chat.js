// api/chat.js — Vercel Serverless Function
// Groq API — DeepSeek-R1 (deepseek-r1-distill-llama-70b) & Llama 3.2 Vision

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  // ── API KEY ────────────────────────────────────────────────────────
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[api/chat] GROQ_API_KEY manquante sur Vercel');
    return res.status(500).json({ error: 'Clé GROQ_API_KEY manquante sur Vercel' });
  }

  try {
    // ── BODY VALIDATION ───────────────────────────────────────────────
    const { messages, imageBase64 } = req.body || {};
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages invalides : tableau non vide requis.' });
    }

    // ── SYSTEM PROMPT ─────────────────────────────────────────────────
    const SYSTEM_PROMPT = `Tu es SMA-Alpha, le professeur virtuel de mathématiques d'élite de Simple Maths Academy (Polytechnique & Médecine EXMD).

CONTEXTE : Tu connais parfaitement les examens belges : EXMD (Médecine/Dentisterie), Polytechnique (ULB, UCL, VUB, Liège), et les cursus B1/BA1. Tu connais les annales, les pièges récurrents, et les formules les plus discriminantes de ces concours.

COMPORTEMENT — MÉTHODE SOCRATIQUE :
- Ne donne JAMAIS la solution ou la réponse directe à un calcul. Pose des questions guidées et fournis des indices progressifs pour mener l'élève à la résolution autonome.
- Si l'élève pose une question fermée ou demande un résultat, recentre en posant la première question de démarche.
- Si l'élève commet une erreur, demande-lui de vérifier une étape précise sans lui dire brutalement "c'est faux".
- Sois chaleureux, dynamique, encourageant et très concis (2 à 4 phrases maximum par réponse).
- Si la question n'est pas mathématique, recentre poliment : "Je suis ton coach maths pour l'EXMD/Polytech — garde le focus !"
- Si une photo d'exercice est transmise, analyse-la attentivement et guide l'élève socratiquement sur ce problème spécifique.

CONSIGNES STRICTES DE FORMATAGE MATHÉMATIQUE (LATEX) :
- Utilise les délimiteurs $ ... $ UNIQUEMENT pour les expressions et formules mathématiques précises (ex: $f(x) = x^2$ ou $\\int_0^1 x\\,dx$).
- Ne place JAMAIS de mots français, de ponctuation ou de phrases explicatives à l'intérieur des délimiteurs $ ... $.
- Exemple correct : "Voici l'intégrale $\\int_0^1 x\\,dx$ que nous allons calculer."
- Exemple INCORRECT : "$Voici l'intégrale \\int_0^1 x dx que nous allons calculer.$"
- Laisse toujours un espace avant et après une formule inline $ ... $.
- Pour les équations en bloc, utilise $$ ... $$ sur une ligne séparée.`;

    // ── SELECT MODEL & BUILD MESSAGES ──────────────────────────────────
    // Llama-3.3-70b-versatile for text reasoning, Llama-3.2-11b-vision for images
    const model = imageBase64 ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';

    const formattedMessages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    messages.forEach((msg, idx) => {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      const isLastUserMsg = (idx === messages.length - 1) && (role === 'user');

      if (isLastUserMsg && imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: msg.content || 'Analyse cet exercice de mathématiques et guide-moi.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${cleanBase64}`
              }
            }
          ]
        });
      } else {
        formattedMessages.push({
          role,
          content: msg.content || ''
        });
      }
    });

    // ── GROQ API CALL (OPENAI COMPATIBLE) ─────────────────────────────
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        temperature: 0.6,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[api/chat] Groq API ${response.status}:`, errorText);
      return res.status(response.status).json({
        error: `Erreur API Groq (${response.status}) : ${errorText}`
      });
    }

    const data = await response.json();
    let replyText = data.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";

    // Strip internal reasoning <think>...</think> tags if present in DeepSeek-R1 output
    replyText = replyText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    return res.status(200).json({ reply: replyText });

  } catch (err) {
    console.error('[api/chat] Erreur serveur inattendue :', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur interne' });
  }
}
