/**
 * Multi-store Stripe local-payments backend (MB WAY / card / wallets)
 * Deploy: Railway. Front-end: Shopify cart drawer + product page buttons.
 */

const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getStore, allowedOrigins } = require("./stores");
const { getAccessToken } = require("./shopify-auth");

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

    const relevant =
      (event.type === "checkout.session.completed" &&
        event.data.object.payment_status === "paid") ||
      event.type === "checkout.session.async_payment_succeeded";

    if (relevant) {
      try {
        await createShopifyOrder(event.data.object);
      } catch (err) {
        console.error("Order creation failed:", err.message);
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

    const shippingAmount =
      subtotal >= store.shipping.freeAbove ? 0 : store.shipping.flatRate;

    const totalValue = ((subtotal + shippingAmount) / 100).toFixed(2);

    const cartCompact = items
      .map((i) => `${i.variant_id}:${Math.max(1, parseInt(i.quantity, 10) || 1)}`)
      .join(",");
    if (cartCompact.length > 480) {
      return res.status(400).json({ error: "Cart too large for one session" });
    }

    const successUrl =
      `${store.origin}${store.successPath}` +
      `?session_id={CHECKOUT_SESSION_ID}` +
      `&value=${encodeURIComponent(totalValue)}` +
      `&currency=${encodeURIComponent(store.currency.toUpperCase())}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // MB WAY + card. Apple Pay and Google Pay are NOT separate types —
      // they appear automatically as express wallet buttons whenever "card"
      // is enabled and the customer's device supports them.
      payment_method_types: store.paymentMethods || [store.paymentMethod],
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
      success_url: successUrl,
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
  const token = await getAccessToken(store);
  const url = `https://${store.shopifyDomain}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": token,
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

const processedSessions = new Set();

async function createShopifyOrder(session) {
  const storeKey = session.metadata?.store;
  const cartCompact = session.metadata?.cart;
  if (!storeKey || !cartCompact) {
    throw new Error(`Session ${session.id} missing metadata`);
  }
  const store = getStore(storeKey);

  if (processedSessions.has(session.id)) return;

  // Shopify order tags are capped at 40 characters EACH — a raw Stripe
  // session id (60-70+ chars) blows that limit and Shopify rejects the
  // whole order with "Order tags is invalid". Use a short, still
  // effectively-unique slice for the tag; the full session id is kept
  // in `note` and `note_attributes` below, which have no such limit.
  const shortSessionTag = "sid-" + session.id.slice(-30);

  const existing = await shopifyFetch(
    store,
    `/orders.json?status=any&fields=id,tags&limit=5&name=&tag=${encodeURIComponent(
      shortSessionTag
    )}`
  ).catch(() => ({ orders: [] }));
  if (
    existing.orders &&
    existing.orders.some((o) => (o.tags || "").includes(shortSessionTag))
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

  // The session can now offer MB WAY, card, Apple Pay or Google Pay, so
  // don't hardcode MB WAY on the order. Stripe reports the method actually
  // used in payment_method_types once the session completes (wallets like
  // Apple/Google Pay report as "card").
  const usedMethod =
    (Array.isArray(session.payment_method_types) &&
    session.payment_method_types.length === 1
      ? session.payment_method_types[0]
      : null) || "card";
  const methodLabel = usedMethod === "mb_way" ? "MB WAY (Stripe)" : "Card (Stripe)";
  const methodTag = usedMethod === "mb_way" ? "mbway" : "card";

  // Stripe charged product + shipping together (amount_total). The order's
  // line_items only cover the product, so without an explicit shipping_line
  // Shopify's own computed total falls short of what was actually paid —
  // it then flags the difference as an owed refund.
  const shippingCostCents = Math.max(
    0,
    (session.amount_total || 0) - (session.amount_subtotal || 0)
  );

  const orderPayload = {
    order: {
      line_items: lineItems,
      shipping_lines:
        shippingCostCents > 0
          ? [{ title: store.shipping.label, price: (shippingCostCents / 100).toFixed(2) }]
          : [],
      email: cd.email || undefined,
      phone: cd.phone || undefined,
      financial_status: "paid",
      currency: session.currency?.toUpperCase(),
      tags: `${methodTag}, stripe, ${shortSessionTag}`,
      note: `Paid via ${methodLabel}. Stripe session: ${session.id}`,
      note_attributes: [
        { name: "stripe_session_id", value: session.id },
        { name: "payment_method", value: methodLabel },
      ],
      inventory_behaviour: "decrement_obeying_policy",
      send_receipt: true,
      shipping_address: ship.line1
        ? {
            first_name: (cd.name || "").split(" ")[0] || "Cliente",
            last_name:
              (cd.name || "").split(" ").slice(1).join(" ") || "Cliente",
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
          gateway: methodLabel,
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
    `Order created for ${storeKey} — ${methodLabel} — session ${session.id}, total ${session.amount_total / 100} ${session.currency}`
  );
}

/* ------------------------------------------------------------------ */

app.listen(PORT, () => console.log(`Payments backend listening on :${PORT}`));
