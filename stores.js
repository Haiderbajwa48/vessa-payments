/**
 * Per-store configuration.
 *
 * quantityDiscounts MIRRORS the Shopify automatic discounts
 * (Discounts → "Vessa — 2 unidades, -10%" and "Vessa — 3 unidades, -20%").
 * The backend calculates the discount itself from these rules — it does
 * NOT trust the browser. If you change the discounts in Shopify, change
 * them here too, or Stripe and the cart will disagree.
 *
 *   excludeTag: products with this tag are NOT eligible (Shopify collection
 *               "Vessa — artigos individuais elegíveis" = tag != Vessa Outdoor)
 *   tiers:      highest minQty first
 *
 * shipping mirrors Shopify's Portugal zone: €2.49 below €39, free from €39
 * (threshold applied to the subtotal AFTER discount, like Shopify).
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
    successPath: "/pages/sucesso",
    cancelPath: "/cart",
    shipping: { freeAbove: 3900, flatRate: 249, label: "Envio" },
    quantityDiscounts: {
      excludeTag: "Vessa Outdoor",
      tiers: [
        { minQty: 3, pct: 20, title: "Vessa — 3 unidades, -20%" },
        { minQty: 2, pct: 10, title: "Vessa — 2 unidades, -10%" },
      ],
    },
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
