/**
 * Per-store configuration.
 *
 * paymentMethods: Stripe payment_method_types offered in Checkout.
 * maxDiscountPct: highest discount % the backend will accept from the cart.
 *   Set this to your HIGHEST real tier. Anything above is capped.
 * shipping: MUST mirror Shopify's Portugal zone (Settings → Shipping):
 *   €2.49 below €39, free from €39.
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
    shipping: { freeAbove: 3900, flatRate: 249, label: "Envio" },
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
