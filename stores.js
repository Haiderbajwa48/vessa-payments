/**
 * Per-store configuration.
 *
 * Currently serving: VESSA (Portugal, MB WAY) only.
 * testOrigins: extra origins allowed through CORS for pre-launch testing —
 * NOT used for success/cancel redirects. Remove plantaris.fr once vessa.pt
 * is live and this store is rebranded; it should never stay here permanently.
 */

const STORES = {
  vessa: {
    origin: "https://2x4uqi-ta.myshopify.com", // swap to "https://vessa.pt" at launch
    testOrigins: ["https://plantaris.fr"],      // TEMP — remove after vessa.pt rebrand
    shopifyDomain: process.env.VESSA_SHOPIFY_DOMAIN, // bare domain, e.g. "2x4uqi-ta.myshopify.com"
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
