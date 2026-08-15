import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error("VARIABLES VERCEL MANQUANTES :", {
      hasStripeSecret: !!stripeSecret,
      hasWebhookSecret: !!webhookSecret,
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey
    });
    return res.status(500).json({ error: "Variables d'environnement Vercel manquantes" });
  }

  const stripe = new Stripe(stripeSecret);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("ÉCHEC SIGNATURE STRIPE :", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.created') {
    const session = event.data.object;
    const customerEmail = session.customer_details?.email || session.customer_email || session.email;

    if (customerEmail) {
      console.log(`Paiement validé pour : ${customerEmail}`);
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_premium: true })
        .eq('email', customerEmail);

      if (error) {
        console.error("Erreur Supabase Update :", error);
        return res.status(500).json({ error: error.message });
      }
    }
  }

  return res.status(200).json({ received: true });
}
