/**
 * Shopify Client Credentials Grant — token acquisition + caching.
 *
 * Since Jan 1 2026, Shopify no longer issues permanent shpat_ tokens for
 * new custom apps created via the Dev Dashboard. Apps only get a
 * Client ID + Client Secret, which must be exchanged for a short-lived
 * access token (valid 24h) via this endpoint. This module fetches that
 * token and caches it per store, refreshing before it expires — the rest
 * of the backend never has to think about it.
 */

const cache = new Map(); // shopifyDomain -> { token, expiresAt }

async function getAccessToken(store) {
  const key = store.shopifyDomain;
  const cached = cache.get(key);
  const now = Date.now();

  // Refresh 5 minutes before actual expiry
  if (cached && cached.expiresAt - now > 5 * 60 * 1000) {
    return cached.token;
  }

  const res = await fetch(`https://${store.shopifyDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: store.clientId,
      client_secret: store.clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const expiresInMs = (data.expires_in || 86399) * 1000;

  cache.set(key, {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  });

  return data.access_token;
}

module.exports = { getAccessToken };
