'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb', strict: true }));
app.use(helmet({
  contentSecurityPolicy: false
}));

const config = {
  port: Number(process.env.PORT || 3000),
  jwtPublicKey: process.env.JWT_PUBLIC_KEY,
  jwtIssuer: process.env.JWT_ISSUER || 'security-api',
  jwtAudience: process.env.JWT_AUDIENCE || 'shopify-integration',
  shopifyStoreDomain: process.env.SHOPIFY_STORE_DOMAIN,
  shopifyToken: process.env.SHOPIFY_ADMIN_API_TOKEN,
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION || '2025-10',
  clockToleranceSeconds: 30
};

if (!config.jwtPublicKey) {
  throw new Error('Missing JWT_PUBLIC_KEY. Use an asymmetric key for JWS verification (recommended ES256/RS256).');
}

function verifyBearerToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_bearer_token' });
  }

  const token = auth.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, config.jwtPublicKey, {
      algorithms: ['ES256', 'RS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      complete: true,
      clockTolerance: config.clockToleranceSeconds
    });

    const payload = decoded.payload;
    if (!payload.sub || !payload.jti || !payload.iat || !payload.exp) {
      return res.status(401).json({ error: 'missing_required_claims' });
    }

    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function buildShopifyUrl(path) {
  if (!config.shopifyStoreDomain) {
    throw new Error('SHOPIFY_STORE_DOMAIN is required to call Shopify API.');
  }
  return `https://${config.shopifyStoreDomain}/admin/api/${config.shopifyApiVersion}/${path}`;
}

async function shopifyRequest(path, method, body) {
  if (!config.shopifyToken) {
    throw new Error('SHOPIFY_ADMIN_API_TOKEN is required to call Shopify API.');
  }

  const response = await fetch(buildShopifyUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.shopifyToken
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${responseText}`);
  }

  return response.json();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get('/api/products', verifyBearerToken, async (_req, res) => {
  try {
    const data = await shopifyRequest('products.json?limit=20', 'GET');
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'shopify_products_failed', message: error.message });
  }
});

app.post('/api/orders', verifyBearerToken, async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return res.status(400).json({ error: 'invalid_idempotency_key' });
  }

  const body = req.body;
  if (!body || !body.order || !Array.isArray(body.order.line_items)) {
    return res.status(400).json({ error: 'invalid_order_payload' });
  }

  try {
    const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const orderData = await shopifyRequest('orders.json', 'POST', body);
    return res.status(201).json({
      idempotencyKey,
      requestDigest: digest,
      order: orderData.order
    });
  } catch (error) {
    return res.status(502).json({ error: 'shopify_order_failed', message: error.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(config.port, () => {
  console.log(`Security API listening on port ${config.port}`);
});
