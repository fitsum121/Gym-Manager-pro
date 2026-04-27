# Quick Deployment Reference Card

## 🚀 Deploy in 5 Steps

### 1. Generate Production Secrets (2 min)
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```
Save these as `JWT_SECRET` and `LICENSE_SECRET`

### 2. Set API Server Environment Variables (3 min)
In your deployment platform (Vercel/Railway/Render):
```
PORT=3000
NODE_ENV=production
ADMIN_EMAIL=your-email@example.com
ADMIN_PASSWORD=your-secure-password
LICENSE_SECRET=<secret-from-step-1>
JWT_SECRET=<secret-from-step-1>
DATABASE_URL=postgres://...
ALLOWED_ORIGINS=https://your-domain.com
```

### 3. Update Mobile App (2 min)
Edit `artifacts/gym-manager/lib/license.ts`:
```typescript
export const LICENSE_SECRET = "<same-as-step-1>";
```

Edit `artifacts/gym-manager/.env`:
```
EXPO_PUBLIC_API_URL=https://your-production-api.com
```

### 4. Deploy API Server (5 min)
```bash
cd artifacts/api-server
pnpm install
pnpm run build
# Deploy to your platform
```

### 5. Build Mobile App (10 min)
```bash
cd artifacts/gym-manager
eas build --platform ios --profile production
eas build --platform android --profile production
```

---

## ✅ Quick Verification

```bash
# Check API
curl https://your-api.com/api/health

# Should return: {"status":"ok"}
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Could not connect to server" | Check `EXPO_PUBLIC_API_URL` in mobile app |
| "Invalid license code" | LICENSE_SECRET doesn't match between app and server |
| "Session expired" immediately | JWT_SECRET changed, users need to re-login |
| CORS error | Add your domain to `ALLOWED_ORIGINS` |

---

## 📚 Full Documentation

- **Complete Guide:** `DEPLOYMENT-GUIDE.md`
- **Environment Setup:** `ENVIRONMENT-SETUP.md`
- **Security Audit:** `PRE-DEPLOYMENT-CHECKLIST.md`
- **Fixes Applied:** `DEPLOYMENT-FIXES-SUMMARY.md`

---

## ⚠️ Critical Reminders

1. ❌ **NEVER** use development secrets in production
2. ❌ **NEVER** commit `.env` files to git
3. ✅ **ALWAYS** generate new secrets for production
4. ✅ **ALWAYS** ensure LICENSE_SECRET matches between app and server
5. ✅ **ALWAYS** use HTTPS in production

---

**Ready to deploy?** Run the verification script first:
```bash
powershell -ExecutionPolicy Bypass -File verify-deployment-ready.ps1
```
