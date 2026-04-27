# Deployment Guide - Gym Manager Pro

## Prerequisites

- [ ] Node.js 18+ installed
- [ ] pnpm installed
- [ ] PostgreSQL database (production)
- [ ] Deployment platform account (Vercel, Railway, Render, etc.)
- [ ] Expo account (for mobile app deployment)

---

## Part 1: Deploy API Server

### Step 1: Prepare Environment Variables

Your deployment platform needs these environment variables:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Admin Credentials (change these!)
ADMIN_EMAIL=your-production-email@example.com
ADMIN_PASSWORD=your-secure-password-min-16-chars

# Secrets (generate new ones - DO NOT use dev secrets!)
# Generate using: node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
LICENSE_SECRET=your-new-production-license-secret
JWT_SECRET=your-new-production-jwt-secret

# Database
DATABASE_URL=your-production-postgres-url

# CORS (comma-separated allowed origins)
ALLOWED_ORIGINS=https://your-admin-panel.com,https://your-domain.com
```

### Step 2: Build the API Server

```bash
cd artifacts/api-server
pnpm install
pnpm run build
```

### Step 3: Deploy

**Option A: Vercel**
```bash
vercel --prod
```

**Option B: Railway**
```bash
railway up
```

**Option C: Render**
- Connect your GitHub repo
- Set build command: `cd artifacts/api-server && pnpm install && pnpm run build`
- Set start command: `node artifacts/api-server/dist/index.js`
- Add environment variables in Render dashboard

### Step 4: Verify Deployment

Test your API:
```bash
curl https://your-api-url.com/api/health
```

Expected response:
```json
{"status":"ok"}
```

---

## Part 2: Deploy Mobile App

### Step 1: Update LICENSE_SECRET

⚠️ **CRITICAL:** The LICENSE_SECRET in the mobile app MUST match the server!

1. Generate a new production LICENSE_SECRET (if you haven't already)
2. Update `artifacts/gym-manager/lib/license.ts`:
   ```typescript
   export const LICENSE_SECRET = "your-production-license-secret";
   ```
3. Set the same value in your API server environment variables

### Step 2: Update API URL

Update `artifacts/gym-manager/.env`:
```bash
EXPO_PUBLIC_API_URL=https://your-production-api.com
```

Or use `.env.production`:
```bash
cp artifacts/gym-manager/.env.production.template artifacts/gym-manager/.env.production
# Edit .env.production with your production URL
```

### Step 3: Build for Production

```bash
cd artifacts/gym-manager
pnpm install

# For iOS
eas build --platform ios --profile production

# For Android
eas build --platform android --profile production
```

### Step 4: Submit to App Stores

```bash
# iOS App Store
eas submit --platform ios

# Google Play Store
eas submit --platform android
```

---

## Part 3: Post-Deployment Verification

### API Server Checks

- [ ] Health endpoint responds: `GET /api/health`
- [ ] Owner registration works: `POST /api/auth/owner/register`
- [ ] Owner login works: `POST /api/auth/owner/login`
- [ ] Database connection is stable
- [ ] CORS is configured correctly
- [ ] Rate limiting is active
- [ ] Logs are being captured

### Mobile App Checks

- [ ] App connects to production API
- [ ] Owner registration flow works
- [ ] Owner login flow works
- [ ] License activation works
- [ ] Member CRUD operations work
- [ ] Staff login works
- [ ] Payment recording works
- [ ] Photos upload/display correctly

### Security Checks

- [ ] All secrets are set via environment variables (not hardcoded)
- [ ] `.env` files are NOT committed to git
- [ ] Database credentials are secure
- [ ] HTTPS is enforced
- [ ] JWT tokens expire correctly
- [ ] Rate limiting prevents abuse
- [ ] CORS only allows trusted origins

---

## Part 4: Monitoring & Maintenance

### Set Up Monitoring

1. **Error Tracking:** Sentry, Rollbar, or similar
2. **Uptime Monitoring:** UptimeRobot, Pingdom
3. **Log Aggregation:** Papertrail, Logtail
4. **Performance:** New Relic, DataDog

### Database Backups

Set up automated backups:
- Daily full backups
- Point-in-time recovery enabled
- Test restore process monthly

### Update Process

1. Test changes locally
2. Deploy to staging environment
3. Run smoke tests
4. Deploy to production
5. Monitor for errors
6. Rollback if needed

---

## Troubleshooting

### "Could not connect to server"
- Check API URL in mobile app `.env`
- Verify API server is running
- Check firewall/security group settings

### "Invalid license code"
- Verify LICENSE_SECRET matches between app and server
- Check code format: `GYM-XXXXXX-YYMMDD-XXXXXXXX`

### "Session expired"
- JWT_SECRET might have changed
- Users need to log in again
- Check JWT expiration settings

### Database connection errors
- Verify DATABASE_URL is correct
- Check database is accepting connections
- Verify SSL settings (`sslmode=require`)

---

## Rollback Plan

If deployment fails:

1. **API Server:**
   ```bash
   # Revert to previous deployment
   vercel rollback  # or your platform's rollback command
   ```

2. **Mobile App:**
   - Previous version remains in app stores
   - Users won't auto-update if build fails

3. **Database:**
   ```bash
   # Restore from backup
   pg_restore -d your_database backup_file.dump
   ```

---

## Support

- **Documentation:** See `PRE-DEPLOYMENT-CHECKLIST.md`
- **Security Updates:** See `SECURITY-UPDATE-NOTES.md`
- **Issues:** Check logs and error tracking service

---

**Last Updated:** April 26, 2026
