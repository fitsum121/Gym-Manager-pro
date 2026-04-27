# Free Hosting Guide - No Credit Card Required

**Best Options for Gym Manager Pro (API Server + Mobile App)**

---

## 🏆 RECOMMENDED: Render.com (Best Overall)

### Why Render?
- ✅ **No credit card required** for free tier
- ✅ Free PostgreSQL database (90 days, then expires)
- ✅ Free web service hosting (750 hours/month)
- ✅ Automatic HTTPS/SSL
- ✅ Git integration (auto-deploy on push)
- ✅ Easy environment variables setup
- ✅ Built-in health checks

### Limitations
- ⚠️ Free services **sleep after 15 minutes** of inactivity
- ⚠️ Wake-up takes **30-60 seconds** (first request is slow)
- ⚠️ Free PostgreSQL expires after 90 days (need to upgrade or migrate)
- ⚠️ 750 hours/month limit (enough for 1 service running 24/7)

### Perfect For
- Testing and development
- Low-traffic apps
- MVP/prototype deployment
- Learning deployment process

---

## 📋 Deployment Plan for Gym Manager Pro

### Option 1: Render.com (Recommended)

#### Step 1: Deploy API Server to Render

1. **Sign up at [render.com](https://render.com)** (no credit card needed)

2. **Create PostgreSQL Database:**
   - Click "New +" → "PostgreSQL"
   - Name: `gym-manager-db`
   - Plan: **Free** (90 days)
   - Click "Create Database"
   - Copy the **External Database URL** (starts with `postgres://`)

3. **Deploy API Server:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** `gym-manager-api`
     - **Root Directory:** `artifacts/api-server`
     - **Environment:** `Node`
     - **Build Command:** `pnpm install && pnpm run build`
     - **Start Command:** `node dist/index.cjs`
     - **Plan:** **Free**

4. **Set Environment Variables:**
   ```
   PORT=3000
   NODE_ENV=production
   ADMIN_EMAIL=your-email@example.com
   ADMIN_PASSWORD=your-secure-password
   LICENSE_SECRET=<generate-new-secret>
   JWT_SECRET=<generate-new-secret>
   DATABASE_URL=<paste-from-step-2>
   ALLOWED_ORIGINS=
   ```

5. **Deploy!**
   - Click "Create Web Service"
   - Wait 5-10 minutes for first deployment
   - Your API will be at: `https://gym-manager-api.onrender.com`

#### Step 2: Build Mobile App with Expo

1. **Update LICENSE_SECRET** in `artifacts/gym-manager/lib/license.ts`
   - Must match the one you set in Render

2. **Update API URL** in `artifacts/gym-manager/.env`:
   ```
   EXPO_PUBLIC_API_URL=https://gym-manager-api.onrender.com
   ```

3. **Build with Expo:**
   ```bash
   cd artifacts/gym-manager
   
   # For Android APK (can install directly)
   eas build --platform android --profile preview
   
   # For iOS (requires Apple Developer account)
   eas build --platform ios --profile preview
   ```

4. **Download and Install:**
   - Expo will provide a download link
   - Install APK on Android devices
   - Share the link with users

---

## 🎯 Alternative Free Options

### Option 2: Railway.app

**Status:** ❌ **No longer has free tier** (removed in 2024)
- Now requires payment from first minute
- Skip this option

### Option 3: Vercel.com

**Good For:** Frontend only
**Not Good For:** Your API server (needs long-running processes)

**Limitations:**
- ⚠️ Serverless functions only (10-second timeout)
- ⚠️ Not suitable for Express.js API with database
- ⚠️ Your API needs persistent connections

**Verdict:** ❌ Not recommended for your backend

### Option 4: Glitch.com

**Status:** ⚠️ **Shutting down** (July 2025)
- Project hosting ends July 8, 2025
- Don't use for new projects

### Option 5: Cyclic.sh

**Good For:** Node.js apps
**Limitations:**
- ⚠️ May require credit card for verification
- ⚠️ Limited free tier

**Verdict:** ⚠️ Render is better

### Option 6: Fly.io

**Good For:** Docker containers
**Limitations:**
- ⚠️ Requires credit card (even for free tier)
- ⚠️ Complex setup

**Verdict:** ❌ Requires credit card

---

## 💡 Best Strategy: Hybrid Approach

### For Development/Testing (Free)
1. **API Server:** Render.com free tier
2. **Database:** Render PostgreSQL (90 days free)
3. **Mobile App:** Build with Expo, distribute APK directly

### For Production (Paid - Later)
When you have users and revenue:
1. **API Server:** Render Starter ($7/month) - no sleep
2. **Database:** Render PostgreSQL ($7/month) - persistent
3. **Mobile App:** Publish to Google Play Store ($25 one-time) and Apple App Store ($99/year)

**Total Production Cost:** ~$14/month + app store fees

---

## 📱 Mobile App Distribution (Free Options)

### Option 1: Direct APK Distribution (Android Only)
- ✅ **Completely free**
- ✅ No app store approval needed
- ✅ Instant updates
- ⚠️ Users must enable "Install from Unknown Sources"
- ⚠️ No automatic updates
- ⚠️ Android only

**How to:**
```bash
cd artifacts/gym-manager
eas build --platform android --profile preview
# Share the download link with users
```

### Option 2: Expo Go App (Development Only)
- ✅ Free for testing
- ⚠️ Not for production
- ⚠️ Users need Expo Go app installed
- ⚠️ Limited native features

### Option 3: TestFlight (iOS - Free Beta)
- ✅ Free for up to 10,000 testers
- ✅ Official Apple distribution
- ⚠️ Requires Apple Developer account ($99/year)
- ⚠️ 90-day expiration on builds

---

## 🚀 Quick Start: Deploy in 30 Minutes

### Prerequisites
```bash
# Generate secrets
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### Step-by-Step

1. **Sign up at Render.com** (2 min)
   - No credit card needed
   - Use GitHub to sign in

2. **Create PostgreSQL Database** (3 min)
   - New + → PostgreSQL → Free plan
   - Copy the External Database URL

3. **Deploy API Server** (10 min)
   - New + → Web Service
   - Connect GitHub repo
   - Set root directory: `artifacts/api-server`
   - Add environment variables
   - Deploy

4. **Update Mobile App** (5 min)
   - Update LICENSE_SECRET in `lib/license.ts`
   - Update EXPO_PUBLIC_API_URL in `.env`

5. **Build Mobile App** (10 min)
   - Run: `eas build --platform android --profile preview`
   - Download APK when ready

**Total Time:** ~30 minutes

---

## ⚠️ Important Notes

### About Free Tier Sleep
Your API will sleep after 15 minutes of inactivity. This means:
- ✅ **Good for:** Testing, demos, low-traffic apps
- ❌ **Bad for:** Production apps with real users

**Solutions:**
1. **Free:** Use a cron job to ping your API every 14 minutes (keeps it awake)
2. **Paid:** Upgrade to Render Starter ($7/month) - no sleep

### About Database Expiration
Render's free PostgreSQL expires after 90 days:
- ✅ **Good for:** Testing, MVP validation
- ❌ **Bad for:** Long-term production

**Solutions:**
1. **Export data** before 90 days
2. **Upgrade** to paid plan ($7/month)
3. **Migrate** to another database (Supabase, Neon, etc.)

---

## 🆘 Troubleshooting

### "Service Unavailable" on first request
- **Cause:** Service is sleeping
- **Solution:** Wait 30-60 seconds for wake-up
- **Prevention:** Upgrade to paid plan or use keep-alive ping

### "Database connection failed"
- **Cause:** Wrong DATABASE_URL or database expired
- **Solution:** Check environment variables, verify database is active

### "CORS error"
- **Cause:** ALLOWED_ORIGINS not set
- **Solution:** Add your frontend domain to ALLOWED_ORIGINS

### Mobile app can't connect
- **Cause:** Wrong API URL
- **Solution:** Verify EXPO_PUBLIC_API_URL matches your Render URL

---

## 📊 Cost Comparison

| Platform | API Hosting | Database | Credit Card | Sleep | Best For |
|----------|-------------|----------|-------------|-------|----------|
| **Render** | Free (750h) | Free (90d) | ❌ No | 15 min | **Recommended** |
| Railway | ❌ Paid | Paid | ✅ Yes | No | Production |
| Vercel | ❌ Not suitable | N/A | ❌ No | N/A | Frontend only |
| Fly.io | Free | Free | ✅ Yes | No | Complex setup |
| Cyclic | Free | Limited | ⚠️ Maybe | Yes | Alternative |

---

## 🎓 Learning Resources

- [Render Documentation](https://render.com/docs)
- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [PostgreSQL on Render](https://render.com/docs/databases)

---

## ✅ Final Recommendation

**For Your Gym Manager Pro App:**

1. **Start with Render.com** (free, no credit card)
   - Deploy API server
   - Use free PostgreSQL (90 days)
   - Perfect for testing and MVP

2. **Distribute Android APK directly**
   - Build with Expo EAS
   - Share download link
   - No app store fees

3. **Upgrade when ready**
   - After validating with users
   - When you have revenue
   - ~$14/month for production-ready setup

**This gives you a completely free deployment to test your app with real users!**

---

**Next Steps:**
1. Read `DEPLOYMENT-GUIDE.md` for detailed instructions
2. Follow Render deployment steps above
3. Test your deployed app
4. Share with beta users

**Need help?** Check the troubleshooting section or refer to Render's documentation.
