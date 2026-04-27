# Deploy Gym Manager Pro — Step by Step
## Stack: Render (API) + Neon (DB) + cron-job.org (keep-alive) + EAS (APK)

---

## STEP 1 — Get your free database from Neon (5 min)

1. Go to → https://neon.tech
2. Click **"Sign up"** → use GitHub (no card needed)
3. Click **"Create a project"**
   - Name: `gym-manager`
   - Region: pick closest to you (e.g. EU Frankfurt or US East)
4. Click **"Create project"**
5. On the dashboard, find **"Connection string"**
   - Click the copy icon next to the string that starts with:
     `postgres://...`
6. **Save this string** — you'll need it in Step 2

---

## STEP 2 — Deploy API Server to Render (10 min)

1. Go to → https://render.com
2. Click **"Get Started for Free"** → sign in with GitHub (no card needed)
3. Click **"New +"** → select **"Web Service"**
4. Click **"Connect a repository"** → select your GitHub repo
5. Fill in the settings:

   | Field | Value |
   |-------|-------|
   | **Name** | `gym-manager-api` |
   | **Region** | Oregon (US West) |
   | **Branch** | `main` |
   | **Root Directory** | *(leave empty)* |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` |
   | **Start Command** | `node artifacts/api-server/dist/index.cjs` |
   | **Plan** | **Free** |

6. Scroll down to **"Environment Variables"** → click **"Add Environment Variable"** for each:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `ADMIN_EMAIL` | your email |
   | `ADMIN_PASSWORD` | a strong password |
   | `LICENSE_SECRET` | `FkIaw6E9bE97aisseLrt/kV23NiQ6tBBfZRqAMCuW2jTWfEbHE8BIewSjfHBxRB9` |
   | `JWT_SECRET` | `Bx2tde5mehED929Jh2OyAGsYGXxzSsMHa2p/8cUlZUNhGqpmsUnajGFTyEMCdAH5` |
   | `DATABASE_URL` | *(paste the Neon connection string from Step 1)* |
   | `ALLOWED_ORIGINS` | *(leave empty)* |

7. Click **"Create Web Service"**
8. Wait 5–10 minutes for the first build to finish
9. Your API URL will be: `https://gym-manager-api.onrender.com`

   ✅ Test it: open `https://gym-manager-api.onrender.com/api/healthz` in your browser
   → should return `{"status":"ok"}`

---

## STEP 3 — Keep the API awake with cron-job.org (3 min)

Render's free tier sleeps after 15 min of no traffic. This fixes it for free.

1. Go to → https://cron-job.org
2. Click **"Sign up"** (no card needed)
3. After login, click **"CREATE CRONJOB"**
4. Fill in:

   | Field | Value |
   |-------|-------|
   | **Title** | `Keep Gym Manager API Awake` |
   | **URL** | `https://gym-manager-api.onrender.com/api/healthz` |
   | **Schedule** | Every **14 minutes** |

5. Click **"CREATE"**

✅ Your API will now stay awake 24/7 for free.

---

## STEP 4 — Build the Android APK (10 min)

### 4a. Update the API URL in the mobile app

Edit the file `artifacts/gym-manager/.env`:
```
EXPO_PUBLIC_API_URL=https://gym-manager-api.onrender.com
```

### 4b. Install EAS CLI (if not already installed)
```bash
npm install -g eas-cli
```

### 4c. Log in to Expo
```bash
eas login
```
→ Sign up at https://expo.dev if you don't have an account (free, no card)

### 4d. Build the APK
```bash
cd artifacts/gym-manager
eas build --platform android --profile preview
```

- This uploads your code to Expo's build servers
- Takes about 10–15 minutes
- When done, Expo gives you a **download link** for the APK

### 4e. Install on Android
- Download the APK on your Android phone
- Go to **Settings → Security → Install unknown apps** → allow your browser
- Open the downloaded APK and install it

---

## STEP 5 — Run database migrations (first time only)

After the API is deployed, you need to create the database tables.

```bash
# From the project root
cd lib/db
DATABASE_URL="<your-neon-connection-string>" pnpm drizzle-kit push
```

Or if you have the `.env` file set up:
```bash
pnpm --filter @workspace/db run db:push
```

---

## ✅ Verification Checklist

- [ ] Neon database created and connection string copied
- [ ] Render service deployed and showing "Live"
- [ ] `https://gym-manager-api.onrender.com/api/healthz` returns `{"status":"ok"}`
- [ ] cron-job.org pinging every 14 minutes
- [ ] `.env` updated with production API URL
- [ ] APK built and downloaded
- [ ] APK installed on Android device
- [ ] App connects to API (try registering an owner)

---

## 🆘 Troubleshooting

### Build fails on Render
- Check the build logs in the Render dashboard
- Most common cause: missing environment variable
- Make sure all 8 env vars are set

### "Cannot connect to database"
- Double-check the DATABASE_URL is the full Neon connection string
- It should start with `postgres://` and contain `neon.tech` in the hostname

### App shows "Could not connect to server"
- Check `EXPO_PUBLIC_API_URL` in `.env` matches your Render URL exactly
- Make sure there's no trailing slash

### First request is slow (30–60 sec)
- This means the cron job hasn't run yet or was just set up
- Wait a few minutes — once cron-job.org starts pinging, it stays fast

---

## 📋 Your Deployment Info (fill in after setup)

```
API URL:        https://gym-manager-api.onrender.com
Health Check:   https://gym-manager-api.onrender.com/api/healthz
Database:       Neon (neon.tech) — project: gym-manager
Keep-alive:     cron-job.org — every 14 min
APK:            Downloaded from EAS build link
```

---

**Total cost: $0.00**
**Credit card used: None**
