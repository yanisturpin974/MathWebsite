// api/stripe-webhook.js — Vercel Serverless Function
// Listens for Stripe payment events and automatically activates is_premium = true in Supabase.
//
// Required Environment Variables in Vercel Dashboard:
//   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET     — whsec_... (from Stripe Dashboard > Webhooks)
//   SUPABASE_URL              — https://kyvarkbdbbawzlziltxg.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service_role key (bypasses RLS, NEVER expose client-side)

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// ── Disable Vercel's automatic body parsing (Stripe needs the raw body for signature verification)
export const config = {
  api: {
    bodyParser: false,
  },
};

// ── Read raw body bytes from the request stream
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Only accept POST requests from Stripe
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Validate required environment variables
  const {
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('stripe-webhook: Missing required environment variables.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  // ── Initialize Stripe & Supabase Admin clients
  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

  // Supabase Admin client uses service_role key — bypasses all RLS policies
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── Read raw body & verify Stripe signature
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('stripe-webhook: Failed to read request body:', err.message);
    return res.status(400).json({ error: 'Failed to read request body.' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('stripe-webhook: Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  console.log(`stripe-webhook: Received event → ${event.type}`);

  // ── Handle relevant Stripe events
  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'customer.subscription.created'
    ) {
      const session = event.data.object;

      // Extract customer email (Stripe provides both locations depending on the flow)
      const customerEmail =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      if (!customerEmail) {
        console.warn('stripe-webhook: No customer email found in event — skipping update.');
        return res.status(200).json({ received: true, warning: 'No email found in event.' });
      }

      console.log(`stripe-webhook: Activating Premium for → ${customerEmail}`);

      // ── Update Supabase: set is_premium = true for this email
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({ is_premium: true, updated_at: new Date().toISOString() })
        .eq('email', customerEmail.toLowerCase().trim())
        .select('id, email, is_premium');

      if (error) {
        console.error('stripe-webhook: Supabase update failed:', error.message);
        // Return 200 to Stripe anyway (so it doesn't retry) — investigate in logs
        return res.status(200).json({ received: true, error: error.message });
      }

      if (!data || data.length === 0) {
        console.warn(`stripe-webhook: No profile found for email: ${customerEmail}`);
        return res.status(200).json({ received: true, warning: 'No profile found for email.' });
      }

      console.log(`stripe-webhook: ✅ Premium activated for ${customerEmail} (id: ${data[0].id})`);
    } else {
      // Acknowledge all other event types without processing
      console.log(`stripe-webhook: Event type "${event.type}" not handled — acknowledged.`);
    }
  } catch (err) {
    console.error('stripe-webhook: Unexpected error during processing:', err.message);
    // Return 200 to avoid Stripe retrying (prevent duplicate activations)
    return res.status(200).json({ received: true, error: 'Internal processing error.' });
  }

  // Always return 200 to confirm receipt to Stripe
  return res.status(200).json({ received: true });
}
