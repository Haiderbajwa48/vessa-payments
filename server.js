/**
 * Multi-store Stripe local-payments backend (MB WAY / BLIK)
 * Deploy: Railway. Front-end: Shopify cart drawer button (see /theme).
 *
 * Flow:
 *   1. Theme JS reads /cart.js, POSTs { store, items:[{variant_id, quantity}] }
 *   2. Backend fetches REAL prices from Shopify Admin API (never trusts client)
 *   3. Creates Stripe Checkout Session (payment_method per store config)
 *   4. Customer pays (MB WAY: phone number + approve in app)
 *   5. Stripe webhook -> create PAID order in Shopify, inventory decremented
 *   6. Customer lands on store success page -> Google Ads / GA4 purchase fires
 */

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getStore, allowedOrigins } = require("./stores");

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = "2024-10";

/* ------------------------------------------------------------------ */
/* Webhook needs the RAW body — register it BEFORE express.json()      */
/* ------------------------------------------------------------------ */

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // MB WAY notifies immediately; handle async variants defensively too.
    const relevant =
      (event.type === "checkout.session.completed" &&
        event.data.object.payment_status === "paid") ||
      event.type === "checkout.session.async_payment_succeeded";

    if (relevant) {
      try {
        await createShopifyOrder(event.data.object);
      } catch (err) {
        console.error("Order creation failed:", err.message);
        // 500 -> Stripe retries the webhook (idempotency guard below)
        return res.status(500).send("Order creation failed");
      }
    }

    if (event.type === "checkout.session.async_payment_failed") {
      console.warn("Async payment failed for session:", event.data.object.id);
    }

    res.json({ received: true });
  }
);

/* ------------------------------------------------------------------ */
/* Normal middleware                                                   */
/* ------------------------------------------------------------------ */

app.use(express.json());
app.use(
  cors({
    origin: allowedOrigins(),
    methods: ["GET", "POST"],
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ */
/* Create Checkout Session                                             */
/* ------------------------------------------------------------------ */

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { store: storeKey, items } = req.body;
    if (!storeKey || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing store or items" });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: "Too many line items" });
    }

    const store = getStore(storeKey);

    // --- Server-side price lookup: NEVER trust client-sent prices -----
    const lineItems = [];
    let subtotal = 0;

    for (const item of items) {
      const qty = Math.max(1, Math.min(parseInt(item.quantity, 10) || 1, 99));
      const variant = await fetchVariant(store, item.variant_id);
      if (!variant) {
        return res
          .status(400)
          .json({ error: `Variant ${item.variant_id} not found` });
      }
      const unitAmount = Math.round(parseFloat(variant.price) * 100);
      subtotal += unitAmount * qty;

      lineItems.push({
        quantity: qty,
        price_data: {
          currency: store.currency,
          unit_amount: unitAmount,
          product_data: {
            name: variant.displayName,
            metadata: { variant_id: String(variant.id) },
          },
        },
      });
    }

    // --- Shipping --------------------------------------------------
    const shippingAmount =
      subtotal >= store.shipping.freeAbove ? 0 : store.shipping.flatRate;

    // --- Compact cart snapshot for the webhook (metadata limit 500c) --
    const cartCompact = items
      .map((i) => `${i.variant_id}:${Math.max(1, parseInt(i.quantity, 10) || 1)}`)
      .join(",");
    if (cartCompact.length > 480) {
      return res.status(400).json({ error: "Cart too large for one session" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: [store.paymentMethod],
      line_items: lineItems,
      locale: store.stripeLocale,
      shipping_address_collection: {
        allowed_countries: store.currency === "pln" ? ["PL"] : ["PT", "FR", "ES"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingAmount, currency: store.currency },
            display_name:
              shippingAmount === 0
                ? `${store.shipping.label} — 0`
                : store.shipping.label,
          },
        },
      ],
      phone_number_collection: { enabled: true },
      success_url: `${store.origin}${store.successPath}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${store.origin}${store.cancelPath}`,
      metadata: {
        store: storeKey,
        cart: cartCompact,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session error:", err.message);
    res.status(500).json({ error: "Could not create checkout session" });
  }
});

/* ------------------------------------------------------------------ */
/* Shopify helpers                                                     */
/* ------------------------------------------------------------------ */

async function shopifyFetch(store, path, options = {}) {
  const url = `https://${store.shopifyDomain}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": store.adminToken,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchVariant(store, variantId) {
  try {
    const data = await shopifyFetch(store, `/variants/${variantId}.json`);
    const v = data.variant;
    let productTitle = "";
    try {
      const p = await shopifyFetch(store, `/products/${v.product_id}.json?fields=title`);
      productTitle = p.product.title;
    } catch (_) {}
    return {
      id: v.id,
      price: v.price,
      displayName:
        v.title && v.title !== "Default Title"
          ? `${productTitle} — ${v.title}`
          : productTitle || `Variant ${v.id}`,
    };
  } catch (err) {
    console.error("fetchVariant failed:", err.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Webhook -> paid Shopify order (idempotent)                          */
/* ------------------------------------------------------------------ */

const processedSessions = new Set(); // fast in-process guard

async function createShopifyOrder(session) {
  const storeKey = session.metadata?.store;
  const cartCompact = session.metadata?.cart;
  if (!storeKey || !cartCompact) {
    throw new Error(`Session ${session.id} missing metadata`);
  }
  const store = getStore(storeKey);

  // Idempotency, layer 1: in-memory
  if (processedSessions.has(session.id)) return;

  // Idempotency, layer 2: survive restarts — search existing orders by tag
  const existing = await shopifyFetch(
    store,
    `/orders.json?status=any&fields=id,tags&limit=5&name=&tag=${encodeURIComponent(
      session.id
    )}`
  ).catch(() => ({ orders: [] }));
  if (
    existing.orders &&
    existing.orders.some((o) => (o.tags || "").includes(session.id))
  ) {
    processedSessions.add(session.id);
    return;
  }

  const lineItems = cartCompact.split(",").map((pair) => {
    const [variant_id, quantity] = pair.split(":");
    return { variant_id: Number(variant_id), quantity: Number(quantity) };
  });

  const cd = session.customer_details || {};
  const ship = cd.address || {};

  const orderPayload = {
    order: {
      line_items: lineItems,
      email: cd.email || undefined,
      phone: cd.phone || undefined,
      financial_status: "paid",
      currency: session.currency?.toUpperCase(),
      tags: `${store.orderTag}, stripe, ${session.id}`,
      note: `Paid via ${store.gatewayLabel}. Stripe session: ${session.id}`,
      note_attributes: [
        { name: "stripe_session_id", value: session.id },
        { name: "payment_method", value: store.gatewayLabel },
      ],
      inventory_behaviour: "decrement_obeying_policy",
      send_receipt: true,
      shipping_address: ship.line1
        ? {
            first_name: (cd.name || "").split(" ")[0] || "Cliente",
            last_name:
              (cd.name || "").split(" ").slice(1).join(" ") || "MB WAY",
            address1: ship.line1,
            address2: ship.line2 || undefined,
            city: ship.city,
            zip: ship.postal_code,
            country_code: ship.country,
            phone: cd.phone || undefined,
          }
        : undefined,
      transactions: [
        {
          kind: "sale",
          status: "success",
          amount: (session.amount_total / 100).toFixed(2),
          gateway: store.gatewayLabel,
        },
      ],
    },
  };

  await shopifyFetch(store, "/orders.json", {
    method: "POST",
    body: JSON.stringify(orderPayload),
  });

  processedSessions.add(session.id);
  console.log(
    `Order created for ${storeKey} — session ${session.id}, total ${session.amount_total / 100} ${session.currency}`
  );
}

/* ------------------------------------------------------------------ */

app.listen(PORT, () => console.log(`Payments backend listening on :${PORT}`));
