# Environment Setup Guide

## Overview

This guide helps you set up environment variables for different deployment scenarios.

---

## 🔧 Local Development

### API Server (`artifacts/api-server/.env`)

```bash
# Already configured - use as-is for local development
PORT=3000
ADMIN_EMAIL=fitsumgebramariam53@gmail.com
ADMIN_PASSWORD=DevPassword123!ChangeInProd
LICENSE_SECRET=FkIaw6E9bE97aisseLrt/kV23NiQ6tBBfZRqAMCuW2jTWfEbHE8BIewSjfHBxRB9
JWT_SECRET=Bx2tde5mehED929Jh2OyAGsYGXxzSsMHa2p/8cUlZUNhGqpmsUnajGFTyEMCdAH5
DATABASE_URL=postgres://avnadmin:AVNS_Vh7-mUwcXY7M3ORV4Zh@pg-3b68c834-fitsumgebremariam193-f0b2.c.aivencloud.com:23399/defaultdb?sslmode=require&uselibpqcompat=true
ALLOWED_ORIGINS=
```

### Mobile App (`artifacts/gym-manager/.env`)

```bash
# Already configured - use as-is for local development
EXPO_PUBLIC_API_URL=http://localhost:3000
```

---

## 🚀 Production Deployment

### Step 1: Generate Production Secrets

Run these commands to generate secure secrets:

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Generate LICENSE_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**Save these values securely!** You'll need them in multiple places.

### Step 2: API Server Environment Variables

Set these in your deployment platform (Vercel, Railway, Render, etc.):

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Admin Credentials
ADMIN_EMAIL=your-production-email@example.com
ADMIN_PASSWORD=your-secure-password-min-16-chars

# Secrets (use the values you generated above)
LICENSE_SECRET=<your-generated-license-secret>
JWT_SECRET=<your-generated-jwt-secret>

# Database (your production database)
DATABASE_URL=postgres://user:password@host:port/database?sslmode=require

# CORS (comma-separated allowed origins)
ALLOWED_ORIGINS=https://your-admin-panel.com,https://your-domain.com
```

### Step 3: Update Mobile App LICENSE_SECRET

⚠️ **CRITICAL:** The LICENSE_SECRET must match between server and mobile app!

Edit `artifacts/gym-manager/lib/license.ts`:

```typescript
export const LICENSE_SECRET = "<your-generated-license-secret>";
```

**This must be the SAME value as the LICENSE_SECRET in your API server environment variables.**

### Step 4: Update Mobile App API URL

Create `artifacts/gym-manager/.env.production`:

```bash
EXPO_PUBLIC_API_URL=https://your-production-api.com
```

Or update the existing `.env` file before building for production.

---

## 📋 Platform-Specific Instructions

### Vercel

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add each variable with scope "Production"
4. Redeploy your application

```bash
vercel env add LICENSE_SECRET production
vercel env add JWT_SECRET production
# ... add all other variables
```

### Railway

1. Go to your project
2. Click "Variables" tab
3. Add each environment variable
4. Railway will auto-redeploy

Or use CLI:
```bash
railway variables set LICENSE_SECRET="your-value"
railway variables set JWT_SECRET="your-value"
# ... add all other variables
```

### Render

1. Go to your web service
2. Navigate to "Environment" tab
3. Add each environment variable
4. Click "Save Changes"
5. Render will auto-redeploy

### Replit

1. Click "Secrets" (lock icon) in the sidebar
2. Add each environment variable as a secret
3. Restart your Repl

### Docker / Docker Compose

Create a `.env.production` file (DO NOT commit to git):

```bash
# Copy from template
cp artifacts/api-server/.env.production.template .env.production

# Edit with your values
nano .env.production
```

Then in your `docker-compose.yml`:

```yaml
services:
  api:
    env_file:
      - .env.production
```

Or pass directly:

```bash
docker run -e LICENSE_SECRET="your-value" -e JWT_SECRET="your-value" ...
```

---

## ✅ Verification Checklist

After setting up environment variables:

### API Server
- [ ] Server starts without errors
- [ ] Health check responds: `curl https://your-api.com/api/health`
- [ ] Database connection works
- [ ] Admin can register/login
- [ ] JWT tokens are issued correctly
- [ ] CORS allows your frontend domains
- [ ] Rate limiting is active

### Mobile App
- [ ] App connects to production API
- [ ] License activation works
- [ ] Owner registration works
- [ ] Owner login works
- [ ] All API calls succeed

### Security
- [ ] No `.env` files committed to git
- [ ] All secrets are different from development
- [ ] LICENSE_SECRET matches between app and server
- [ ] Database credentials are secure
- [ ] HTTPS is enforced
- [ ] CORS is properly configured

---

## 🔒 Security Best Practices

1. **Never commit `.env` files to git**
   - Already configured in `.gitignore`
   - Double-check: `git status` should not show `.env` files

2. **Use different secrets for each environment**
   - Development secrets ≠ Production secrets
   - Staging secrets ≠ Production secrets

3. **Rotate secrets regularly**
   - Every 90 days minimum
   - Immediately if compromised
   - After team member departure

4. **Use secret management services**
   - AWS Secrets Manager
   - Azure Key Vault
   - HashiCorp Vault
   - Your platform's built-in secrets

5. **Limit access to production secrets**
   - Only senior developers
   - Use role-based access control
   - Audit secret access logs

6. **Monitor for exposed secrets**
   - Use tools like GitGuardian
   - Enable GitHub secret scanning
   - Set up alerts for exposed credentials

---

## 🆘 Troubleshooting

### "LICENSE_SECRET environment variable is required"
- Check that LICENSE_SECRET is set in your environment
- Verify the variable name is exactly `LICENSE_SECRET` (case-sensitive)
- Restart your server after adding the variable

### "Invalid license code signature"
- LICENSE_SECRET in mobile app doesn't match server
- Update `artifacts/gym-manager/lib/license.ts` with correct secret
- Rebuild and redeploy mobile app

### "Could not connect to database"
- Verify DATABASE_URL is correct
- Check database is accepting connections
- Verify SSL mode is correct (`sslmode=require`)
- Check firewall/security group settings

### "CORS error" in browser
- Add your frontend domain to ALLOWED_ORIGINS
- Format: `https://domain1.com,https://domain2.com` (no spaces)
- Restart server after changing CORS settings

### "Session expired" immediately after login
- JWT_SECRET might have changed
- Clear app data and try again
- Verify JWT_SECRET is set correctly

---

## 📝 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | `3000` |
| `NODE_ENV` | No | Environment mode | `production` |
| `ADMIN_EMAIL` | Yes | Admin email for initial setup | `admin@example.com` |
| `ADMIN_PASSWORD` | Yes | Admin password | `SecurePass123!` |
| `LICENSE_SECRET` | Yes | License signing secret (64+ chars) | `base64-string` |
| `JWT_SECRET` | Yes | JWT signing secret (64+ chars) | `base64-string` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgres://...` |
| `ALLOWED_ORIGINS` | No | CORS allowed origins (comma-separated) | `https://app.com` |
| `EXPO_PUBLIC_API_URL` | Yes (mobile) | API server URL | `https://api.example.com` |

---

**Last Updated:** April 26, 2026
