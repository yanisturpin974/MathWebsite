/**
 * Example Webhook for Tracking Stripe Payments
 * 
 * 1. Install dependencies: npm install express stripe
 * 2. Start server: node webhook.example.js
 * 3. Use the Stripe CLI to test locally: stripe listen --forward-to localhost:4242/webhook
 */

const express = require('express');
const stripe = require('stripe')('sk_test_YOUR_STRIPE_SECRET_KEY'); // Replace with your test/live secret key

const app = express();

// Stripe needs the raw body to verify the webhook signature
// Use express.raw() instead of express.json()
app.post('/webhook', express.raw({type: 'application/json'}), (request, response) => {
  const sig = request.headers['stripe-signature'];
  const endpointSecret = 'whsec_YOUR_STRIPE_WEBHOOK_SECRET'; // Find in Stripe Developer Dashboard

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error(`❌ Webhook signature verification failed: ${err.message}`);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout sessions
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    console.log('====================================');
    console.log(`✅ Payment received! Session ID: ${session.id}`);
    console.log(`👤 Customer Email: ${session.customer_details?.email}`);
    console.log(`💰 Amount Total: ${session.amount_total / 100} ${session.currency.toUpperCase()}`);
    console.log('====================================');
    
    // Add your business logic here
    // e.g. Send an automated welcome email, update a database, notify tutor on Slack
  } else {
    // Other event types you might care about
    // console.log(`Unhandled event type ${event.type}`);
  }

  // Acknowledge receipt to Stripe
  response.send();
});

const PORT = 4242;
app.listen(PORT, () => console.log(`Webhook server listening on port ${PORT}`));
