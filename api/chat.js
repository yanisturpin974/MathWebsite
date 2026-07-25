// api/chat.js — Secure Vercel Serverless Function
// HARD LOCK: Maintenance Kill Switch activated.

export default async function handler(req, res) {
  // Allow CORS from same origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // HARD LOCK KILL SWITCH
  return res.status(503).json({ error: "Maintenance en cours. SMA-Alpha revient demain." });
}
