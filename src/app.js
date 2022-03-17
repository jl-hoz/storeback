const express = require('express');
const app = express();
const {resolve} = require('path');
const env = require('dotenv').config({path: './.env'});

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(
  express.json({
    verify: function (req, res, buf) {
      if (req.originalUrl.startsWith('/webhook')) {
        req.rawBody = buf.toString();
      }
    },
  })
);

app.get('/api/v1/config', (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    availableMethods: [
      "SEPA",
      "Card"
    ],
  });
});

const bookProduct = {
  name: "El nombre del viento",
  author: "Patrick Rothfuss",
  price: {
    usd: {
      currency: "usd",
      amount: 1900,
    },
    eur: {
      currency: "eur",
      amount: 1850,
    }
  }
}

console.log(bookProduct);

app.post('/api/v1/sepa', async (req, res) => {

  const {paymentMethodType, iban, currency, name, email} = req.body;
  console.log(req.body)
  console.log(paymentMethodType);
  console.log(currency);
  console.log(name);
  console.log(email);
  console.log(iban);


  const source = await stripe.sources.create({
    type: 'sepa_debit',
    sepa_debit: { iban: 'ES0700120345030000067890' },
    currency: 'eur',
    owner: {
      name: name,
      email: email,
    },
    iban
  }, function(err, source) {
    // asynchronously called
    console.log(err);
  });

  console.log(source);

  const customer = await stripe.customers.create({
    email,
    source
  });

  console.log(customer);


  const charge = await stripe.charges.create({
    amount: 1099,
    currency: 'eur',
    customer: customer,
    source: source
  });

  console.log(charge);
});

app.post('/api/v1/create-payment-intent', async (req, res) => {
  const {paymentMethodType, currency} = req.body;
  // amount parameter: https://stripe.com/docs/currencies#zero-decimal
  const params = {
    payment_method_types: [paymentMethodType],
    amount: 1500, // 15.00 in case of appropiate currency
    currency: currency,
  }

  if(paymentMethodType === 'acss_debit') {
    params.payment_method_options = {
      acss_debit: {
        mandate_options: {
          payment_schedule: 'sporadic',
          transaction_type: 'personal',
        },
      },
    }
  }

  // Create a PaymentIntent with the amount, currency, and a payment method type.
  try {
    const paymentIntent = await stripe.paymentIntents.create(params);

    // Send publishable key and PaymentIntent details to client
    res.send({
      clientSecret: paymentIntent.client_secret,
    });

    console.log('Payment captured!');
  } catch (e) {
    return res.status(400).send({
      error: {
        message: e.message,
      },
    });
  }
});

// Expose a endpoint as a webhook handler for asynchronous events.
app.post('/webhook', async (req, res) => {
  let data, eventType;

  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === 'payment_intent.succeeded') {
    // TODO: Funds have been captured
    // TODO: Fulfill any orders, e-mail receipts, etc
    // TODO: To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds)
    console.log('Payment captured!');
  } else if (eventType === 'payment_intent.payment_failed') {
    console.log('Payment failed.');
  }
  res.sendStatus(200);
});

app.listen(4242, () =>
  console.log(`Node server listening at http://localhost:4242`)
);
