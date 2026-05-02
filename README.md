# Shopify Security API (Products + Orders)

This project demonstrates a **secure third-party API integration** with Shopify Admin API for products and orders, using **JWT/JWS verification** and basic API hardening.

## Security controls implemented

- Verify Bearer JWT with signature validation (JWS) using **asymmetric algorithms only** (`ES256`, `RS256`).
- Enforce `iss`, `aud`, `exp`, `iat`, `sub`, and `jti` claims.
- Reject missing/malformed Authorization header.
- Use `helmet` and disable `x-powered-by`.
- Enforce JSON payload size and structure.
- Require `Idempotency-Key` for order creation.
- Never expose Shopify token in API responses.

## Endpoints

- `GET /health`
- `GET /api/products` (auth required)
- `POST /api/orders` (auth required)

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your values
npm start
```

## Security guidelines for production

1. Put API behind TLS (HTTPS) and WAF.
2. Use key rotation and short JWT expiry (`exp`).
3. Maintain deny-list/replay protection keyed by `jti`.
4. Add strict rate limiting and anomaly detection.
5. Log security events without sensitive token payloads.
6. Restrict Shopify token scopes to minimum required permissions.
7. Validate order schema with a strict validator (e.g., JSON Schema).
8. Implement robust retry policy for Shopify 429 responses.

## Example request

```bash
curl -X GET http://localhost:3000/api/products \
  -H "Authorization: Bearer <signed-jwt>"
```
