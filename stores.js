/**
 * Per-store configuration.
 *
 * Currently serving: VESSA (Portugal) only.
 * origin: canonical URL used for Stripe success/cancel redirects.
 * testOrigins: other domains allowed through CORS during the cutover window.
 *
 * paymentMethods: Stripe payment_method_types offered in Checkout.
 *   "mb_way" — Portuguese wallet, phone-number + app approval
 *   "card"   — also surfaces Apple Pay / Google Pay express buttons
 *              automatically on supported devices (no extra type needed)
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
    stripeLocale: "pt",
    gatewayLabel: "MB WAY (Stripe)",
    successPath: "/pages/sucesso",
    cancelPath: "/cart",
    shipping: { freeAbove: 4000, flatRate: 490, label: "Envio" },
    orderTag: "mbway",
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
