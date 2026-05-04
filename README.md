# .NET Core + Angular SSO Reference Implementation

This repository now contains a practical blueprint for implementing the security stack you requested:

- **Authentication methods**: password, MFA, biometrics, and OIDC login
- **Token strategy**: JWT access tokens plus refresh tokens / server-side session IDs
- **Authorization framework**: OAuth 2.0 and OIDC
- **Delivery method**: Bearer token in `Authorization` header
- **Architecture pattern**: SSO for multiple apps (Angular SPA + .NET Core APIs)

## 1) Target architecture (SSO)

1. User opens Angular app.
2. Angular redirects to external Identity Provider (IdP) using **OIDC Authorization Code + PKCE**.
3. IdP authenticates with password + optional MFA + optional platform biometrics (WebAuthn/FIDO2).
4. Angular receives code and exchanges for tokens.
5. Angular calls .NET Core API using `Authorization: Bearer <access_token>`.
6. API validates JWT and enforces OAuth2 scopes/roles/policies.
7. For long-lived login, refresh token rotation is used; optional server-side session ID is kept at IdP/BFF.
8. User signs into one app and is silently signed into sibling apps via IdP session = **SSO**.

## 2) Recommended product choices

- **IdP**: Microsoft Entra ID (Azure AD), Auth0, Keycloak, Okta, or Duende IdentityServer
- **.NET**: ASP.NET Core 8/9 Web API
- **Angular**: Angular 17+ with `angular-oauth2-oidc` or `@azure/msal-angular`

## 3) ASP.NET Core API implementation

Create a Web API and configure JWT bearer authentication.

### Program.cs

```csharp
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Auth:Authority"]; // e.g. https://idp.example.com
        options.Audience = builder.Configuration["Auth:Audience"];   // API resource/audience
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            NameClaimType = "name",
            RoleClaimType = "role"
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("api.read", policy =>
        policy.RequireClaim("scope", "api.read"));

    options.AddPolicy("api.write", policy =>
        policy.RequireClaim("scope", "api.write"));

    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));
});

builder.Services.AddControllers();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

### Example secured controller

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "api.read")]
    public IActionResult GetOrders() => Ok(new[] { "order-1", "order-2" });

    [HttpPost]
    [Authorize(Policy = "api.write")]
    public IActionResult CreateOrder() => Ok("created");

    [HttpDelete("{id}")]
    [Authorize(Policy = "AdminOnly")]
    public IActionResult DeleteOrder(string id) => Ok($"deleted {id}");
}
```

### appsettings.json (example)

```json
{
  "Auth": {
    "Authority": "https://idp.example.com",
    "Audience": "api://orders-api"
  }
}
```

## 4) Angular SPA implementation (OIDC + Bearer)

Install library:

```bash
npm i angular-oauth2-oidc
```

### auth.config.ts

```typescript
import { AuthConfig } from 'angular-oauth2-oidc';

export const authConfig: AuthConfig = {
  issuer: 'https://idp.example.com',
  redirectUri: window.location.origin + '/index.html',
  clientId: 'angular-spa-client',
  responseType: 'code',
  scope: 'openid profile email api.read api.write offline_access',
  showDebugInformation: false,
  strictDiscoveryDocumentValidation: true,
  useSilentRefresh: true
};
```

### app.module.ts

```typescript
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { OAuthModule } from 'angular-oauth2-oidc';

@NgModule({
  imports: [
    HttpClientModule,
    OAuthModule.forRoot({
      resourceServer: {
        allowedUrls: ['https://localhost:5001/api'],
        sendAccessToken: true
      }
    })
  ]
})
export class AppModule {}
```

### auth.service.ts

```typescript
import { Injectable } from '@angular/core';
import { OAuthService } from 'angular-oauth2-oidc';
import { authConfig } from './auth.config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private oauth: OAuthService) {}

  async init() {
    this.oauth.configure(authConfig);
    await this.oauth.loadDiscoveryDocumentAndTryLogin();

    if (!this.oauth.hasValidAccessToken()) {
      this.oauth.initCodeFlow();
    }
  }

  logout() {
    this.oauth.logOut();
  }

  get accessToken() {
    return this.oauth.getAccessToken();
  }
}
```

## 5) Authentication methods details

### Password
- Managed by IdP login page.
- Enforce strong password policy and breached-password checks.

### MFA
- Enable TOTP, push, or SMS (prefer TOTP/push over SMS).
- Use adaptive/risk-based MFA where possible.

### Biometrics
- Implement with **WebAuthn/FIDO2 passkeys** at IdP.
- Works as phishing-resistant second factor or passwordless login.

### OIDC login
- Use OIDC Code Flow + PKCE for SPA.
- Keep tokens short-lived; use refresh token rotation.

## 6) Token model (JWT + session IDs)

- **Access token**: JWT, 5–15 minute expiry, sent as Bearer header.
- **Refresh token**: opaque, rotated each use, revoke on suspicious reuse.
- **Session ID**: maintained at IdP/BFF to power SSO and global logout.

## 7) OAuth2 authorization

Define API scopes such as:
- `api.read`
- `api.write`
- `api.admin`

Map scopes/roles/claims to ASP.NET Core policies.

## 8) Security hardening checklist

- Enforce HTTPS everywhere.
- Validate issuer/audience/signature/lifetime/nonce.
- Protect against XSS/CSRF.
- Use same-site cookies if adopting a BFF.
- Turn on logout propagation/front-channel or back-channel logout.
- Add audit logs for sign-ins, token refresh, consent, admin actions.

## 9) When to use BFF pattern

For higher security in SPAs, consider **Backend-for-Frontend (BFF)**:
- Tokens stay server-side.
- Browser only receives secure HTTP-only session cookie.
- Reduces token theft risk from XSS.

