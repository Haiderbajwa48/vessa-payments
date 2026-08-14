const STORES = {
  vessa: {
    // TEMP: testing origin — swap to "https://vessa.pt" before going live
    origin: "https://2x4uqi-ta.myshopify.com",
    shopifyDomain: process.env.VESSA_SHOPIFY_DOMAIN, // must be this SAME domain
    adminToken: process.env.VESSA_ADMIN_TOKEN,
    currency: "eur",
    paymentMethod: "mb_way",
    stripeLocale: "pt",
    gatewayLabel: "MB WAY (Stripe)",
    successPath: "/pages/sucesso",
    cancelPath: "/cart",
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
    paymentMethod: "blik",
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
