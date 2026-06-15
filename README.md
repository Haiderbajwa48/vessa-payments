# VESSA Payments Backend — MB WAY (+ BLIK) via Stripe

One Node.js backend serving **all stores** (vessa.pt, gerlak.pl, luxenordique.com).
Per-store config lives in `stores.js` — success/cancel URLs are dynamic.
This replaces the gerlak-hardcoded URLs in the old BLIK backend.

```
Cart drawer button  ->  POST /create-checkout-session  ->  Stripe hosted Checkout (MB WAY)
Customer approves in MB WAY app  ->  Stripe webhook  ->  PAID order created in Shopify
Customer redirected  ->  vessa.pt/pages/sucesso  ->  Google Ads + GA4 purchase fires
```

---

## 1. Deploy (GitHub -> Railway)

```bash
git init && git add . && git commit -m "MB WAY multi-store checkout"
# create empty repo on GitHub, then:
git remote add origin git@github.com:YOURUSER/vessa-payments.git
git push -u origin main
```

Railway -> **New Project -> Deploy from GitHub repo**. Railway detects Node
and runs `npm start` automatically. Note your public URL
(e.g. `https://vessa-payments.up.railway.app`).

## 2. Environment variables (Railway -> Variables)

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (the Stripe account with MB WAY approved) |
| `STRIPE_WEBHOOK_SECRET` | from step 3 |
| `VESSA_SHOPIFY_DOMAIN` | `your-store.myshopify.com` |
| `VESSA_ADMIN_TOKEN` | `shpat_...` (step 4) |
| `GERLAK_SHOPIFY_DOMAIN` / `GERLAK_ADMIN_TOKEN` | only if migrating BLIK onto this backend |
| `LUXE_SHOPIFY_DOMAIN` / `LUXE_ADMIN_TOKEN` | only if needed |

## 3. Stripe webhook

Stripe Dashboard -> Developers -> Webhooks -> **Add endpoint**
- URL: `https://YOUR-APP.up.railway.app/webhook`
- Events: `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`
- Copy the signing secret -> `STRIPE_WEBHOOK_SECRET`

Also confirm in Stripe -> Settings -> Payment methods that **MB WAY** is
enabled on the live account.

## 4. Shopify Admin API token (per store)

Shopify Admin -> Settings -> Apps and sales channels -> Develop apps ->
Create app ("Payments backend") -> Configure Admin API scopes:

- `read_products` (price lookup)
- `write_orders`, `read_orders` (order creation + idempotency check)

Install app -> reveal **Admin API access token** (`shpat_...`).

## 5. Theme install (vessa.pt)

1. `snippets/mbway-button.liquid` -> paste `theme/mbway-button.liquid`,
   set `BACKEND_URL`, render it above the existing checkout button in the
   cart drawer. Card payments keep going through Shopify checkout untouched.
2. Create page with handle `sucesso`, template from
   `theme/success-page.liquid`, fill in `AW-XXXXXXXXX/CONVERSION_LABEL`.

## 6. Test plan — run BEFORE first ad euro

1. **Stripe sandbox first**: use Stripe's MB WAY test phone numbers
   (docs.stripe.com/payments/mb-way -> test integration) against a dev
   store or with test keys.
2. **Live €1 test**: create a hidden €1 product, buy it through the MB WAY
   button with a real Portuguese number. Verify, in order:
   - [ ] Stripe payment succeeded
   - [ ] Shopify order exists, marked **Paid**, tagged `mbway`
   - [ ] Inventory decremented
   - [ ] Customer confirmation email sent
   - [ ] Redirected to `/pages/sucesso`
   - [ ] Google Ads conversion registered (check next day in Ads UI)
   - [ ] Refresh success page -> conversion does NOT double-fire
3. **Webhook retry test**: Stripe Dashboard -> webhook -> resend the event.
   Confirm NO duplicate order is created (idempotency via session-id tag).

## Notes

- Prices are looked up server-side from Shopify — the client only sends
  variant IDs and quantities. Cart tampering is impossible.
- Shipping: configured per store in `stores.js` (`freeAbove` / `flatRate`,
  amounts in cents). Keep it identical to the storefront's advertised
  threshold — ONE threshold everywhere, no contradictions.
- MB WAY = immediate payment notification, so orders are created on
  `checkout.session.completed`. Async handlers exist as a safety net.
- The in-memory idempotency set resets on redeploy; the order-tag lookup
  is the durable guard.
