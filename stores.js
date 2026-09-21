/**
 * Per-store configuration.
 *
 * paymentMethods: Stripe payment_method_types offered in Checkout.
 * maxDiscountPct: highest discount % the backend will accept from the cart.
 *   Set this to your HIGHEST real tier (e.g. 3-item discount). Anything the
 *   browser claims above this is capped — protects against tampered requests.
 */

const STORES = {
  vessa: {
    origin: "https://www.vessa.eu",
    testOrigins: [
      "https://vessa.eu",
      "https://plantaris.fr",
      "https://2x4uqi-ta.myshopify.com",
    ],
    shopifyDomain: process.env.VESSA_SHOPIFY_DOMAIN,
    clientId: process.env.VESSA_CLIENT_ID,
    clientSecret: process.env.VESSA_CLIENT_SECRET,
    currency: "eur",
    paymentMethods: ["mb_way", "card"],
    maxDiscountPct: 25,
    stripeLocale: "pt",
    successPath: "/pages/sucesso",
    cancelPath: "/cart",
    shipping: { freeAbove: 3900, flatRate: 490, label: "Envio" },
  },
};

function getStore(key) {
  const store = STORES[key];
  if (!store) throw new Error(`Unknown store key: ${key}`);
  if (!store.shopifyDomain || !store.clientId || !store.clientSecret) {
    throw new Error(`Store "${key}" is missing Shopify env vars`);
  }
  return store;
}

function allowedOrigins() {
  return Object.values(STORES).flatMap((s) => [s.origin, ...(s.testOrigins || [])]);
}

module.exports = { STORES, getStore, allowedOrigins };
