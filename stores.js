/**
 * Per-store configuration.
 *
 * Currently serving: VESSA (Portugal, MB WAY) only.
 * Domain cutover in progress: plantaris.fr -> vessa.eu (same Shopify store,
 * same myshopify.com backend domain — only the customer-facing domain changed).
 *
 * origin: the canonical URL used for Stripe success/cancel redirects.
 * testOrigins: every other domain that should still pass CORS during the
 * cutover window (www variant, apex variant, old domain, myshopify preview).
 * Trim this list down once vessa.eu is fully settled as primary.
 */

const STORES = {
  vessa: {
    origin: "https://www.vessa.eu", // update if Shopify's primary domain is the apex (no www) instead — check Settings -> Domains
    testOrigins: [
      "https://vessa.eu",
      "https://plantaris.fr",
      "https://2x4uqi-ta.myshopify.com",
    ],
    shopifyDomain: process.env.VESSA_SHOPIFY_DOMAIN, // unchanged — same store, e.g. "2x4uqi-ta.myshopify.com"
    clientId: process.env.VESSA_CLIENT_ID,
    clientSecret: process.env.VESSA_CLIENT_SECRET,
    currency: "eur",
    paymentMethod: "mb_way",
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
