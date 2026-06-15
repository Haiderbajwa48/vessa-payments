/**
 * Per-store configuration.
 *
 * ONE backend, MANY stores. Every request must carry a `store` key that
 * matches an entry here. Success/cancel URLs, Shopify credentials, currency,
 * payment method and locale are all resolved per store — nothing is hardcoded.
 *
 * Env var convention per store:  <PREFIX>_SHOPIFY_DOMAIN, <PREFIX>_ADMIN_TOKEN
 * Shared:                        STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */

const STORES = {
  vessa: {
    // Public storefront origin (used for CORS + redirect URLs)
    origin: "https://vessa.pt",
    // myshopify.com domain for Admin API calls
    shopifyDomain: process.env.VESSA_SHOPIFY_DOMAIN, // e.g. "vessa-pt.myshopify.com"
    adminToken: process.env.VESSA_ADMIN_TOKEN,       // Admin API access token (shpat_...)
    currency: "eur",
    paymentMethod: "mb_way",
    stripeLocale: "pt",
    gatewayLabel: "MB WAY (Stripe)",
    successPath: "/pages/sucesso",
    cancelPath: "/cart",
    // Shipping: free above threshold, else flat rate (amounts in cents)
    shipping: { freeAbove: 4000, flatRate: 490, label: "Envio" },
    orderTag: "mbway",
  },

  gerlak: {
    origin: "https://gerlak.pl",
    shopifyDomain: process.env.GERLAK_SHOPIFY_DOMAIN,
    adminToken: process.env.GERLAK_ADMIN_TOKEN,
    currency: "pln",
    paymentMethod: "blik",
    stripeLocale: "pl",
    gatewayLabel: "BLIK (Stripe)",
    successPath: "/pages/sukces",
    cancelPath: "/cart",
    shipping: { freeAbove: 20000, flatRate: 1500, label: "Dostawa" },
    orderTag: "blik",
  },

  luxenordique: {
    origin: "https://luxenordique.com",
    shopifyDomain: process.env.LUXE_SHOPIFY_DOMAIN,
    adminToken: process.env.LUXE_ADMIN_TOKEN,
    currency: "eur",
    paymentMethod: "blik", // change if this store uses a different local method
    stripeLocale: "fr",
    gatewayLabel: "Stripe",
    successPath: "/pages/merci",
    cancelPath: "/cart",
    shipping: { freeAbove: 5000, flatRate: 590, label: "Livraison" },
    orderTag: "stripe-local",
  },
};

function getStore(key) {
  const store = STORES[key];
  if (!store) throw new Error(`Unknown store key: ${key}`);
  if (!store.shopifyDomain || !store.adminToken) {
    throw new Error(`Store "${key}" is missing Shopify env vars`);
  }
  return store;
}

function allowedOrigins() {
  return Object.values(STORES).map((s) => s.origin);
}

module.exports = { STORES, getStore, allowedOrigins };
