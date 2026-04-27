import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { makeActivationCode } from "../lib/license";
import { db, ownersTable, licensesTable, adminsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { hashPassword, comparePassword } from "../lib/hash";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Bootstrap — seed the first admin from env vars if the admins table is empty.
// ---------------------------------------------------------------------------
async function seedAdminIfNeeded() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed");
    return;
  }
  try {
    const existing = await db.select({ id: adminsTable.id }).from(adminsTable).limit(1);
    if (existing.length > 0) return;
    const passwordHash = await hashPassword(password);
    await db.insert(adminsTable).values({ email: email.toLowerCase(), passwordHash });
    logger.info({ email }, "Admin account seeded from environment variables");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account — check DB connection");
  }
}
seedAdminIfNeeded();

// ---------------------------------------------------------------------------
// Auth middleware — verifies HTTP Basic credentials against the admins table.
// ---------------------------------------------------------------------------
async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const colonIdx = decoded.indexOf(":");
      const email = decoded.slice(0, colonIdx).toLowerCase();
      const password = decoded.slice(colonIdx + 1);
      if (email && password) {
        const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.email, email)).limit(1);
        if (admin && (await comparePassword(password, admin.passwordHash))) {
          next();
          return;
        }
      }
    } catch (err) {
      logger.error({ err }, "Admin auth error");
    }
  }
  // Return JSON 401 — no WWW-Authenticate header so the browser never shows
  // its native Basic Auth popup. The HTML panel handles login in JS.
  res.status(401).json({ error: "Authentication required." });
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

router.get("/admin/owners", requireAdmin, async (_req, res) => {
  try {
    const owners = await db.select({
      id: ownersTable.id, gymId: ownersTable.gymId, name: ownersTable.name,
      gymName: ownersTable.gymName, phone: ownersTable.phone,
      email: ownersTable.email, createdAt: ownersTable.createdAt,
    }).from(ownersTable).orderBy(desc(ownersTable.createdAt));
    res.json({ owners });
  } catch { res.status(500).json({ error: "Failed to fetch owners." }); }
});

router.delete("/admin/owners/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await db.delete(ownersTable)
      .where(eq(ownersTable.id, String(req.params.id)))
      .returning({ gymId: ownersTable.gymId, name: ownersTable.name });
    if (deleted.length === 0) { res.status(404).json({ error: "Owner not found." }); return; }
    logger.info({ owner: deleted[0] }, "Admin deleted gym owner");
    res.status(204).send();
  } catch { res.status(500).json({ error: "Failed to delete owner." }); }
});

router.get("/admin/licenses", requireAdmin, async (_req, res) => {
  try {
    const licenses = await db.select().from(licensesTable).orderBy(desc(licensesTable.createdAt));
    res.json({ licenses });
  } catch { res.status(500).json({ error: "Failed to fetch licenses." }); }
});

router.delete("/admin/licenses/:id", requireAdmin, async (req, res) => {
  const licId = parseInt(String(req.params.id), 10);
  if (isNaN(licId)) { res.status(400).json({ error: "Invalid license ID." }); return; }
  try {
    const deleted = await db.delete(licensesTable)
      .where(eq(licensesTable.id, licId))
      .returning({ gymId: licensesTable.gymId, code: licensesTable.code });
    if (deleted.length === 0) { res.status(404).json({ error: "License not found." }); return; }
    logger.info({ license: deleted[0] }, "Admin revoked license");
    res.status(204).send();
  } catch { res.status(500).json({ error: "Failed to revoke license." }); }
});

router.post("/admin/generate-code", requireAdmin, async (req, res) => {
  try {
    const gymId = String(req.body?.gymId ?? "").trim().toUpperCase();
    const days = parseInt(String(req.body?.days ?? "0"), 10);
    const validDays = [30, 90, 180, 365];
    if (!/^[A-Z0-9]{6}$/.test(gymId)) { res.status(400).json({ error: "Gym ID must be 6 alphanumeric characters." }); return; }
    if (!validDays.includes(days)) { res.status(400).json({ error: "Days must be 30, 90, 180, or 365." }); return; }
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    const code = makeActivationCode(gymId, expiryDate);
    await db.insert(licensesTable).values({ gymId, code, expiryDate }).onConflictDoNothing();
    res.json({ code, gymId, days, expiryDate: expiryDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) });
  } catch { res.status(500).json({ error: "Server error generating code." }); }
});

// PATCH /api/admin/profile — update admin email
router.patch("/admin/profile", requireAdmin, async (req, res) => {
  const { newEmail } = req.body ?? {};
  if (!newEmail || !String(newEmail).includes("@")) {
    res.status(400).json({ error: "A valid newEmail is required." });
    return;
  }

  const header = req.headers.authorization ?? "";
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const currentEmail = decoded.slice(0, decoded.indexOf(":")).toLowerCase();

  try {
    const normalised = String(newEmail).toLowerCase().trim();

    // Check if new email is already taken by another admin
    const [conflict] = await db
      .select({ id: adminsTable.id })
      .from(adminsTable)
      .where(eq(adminsTable.email, normalised))
      .limit(1);

    if (conflict) {
      res.status(409).json({ error: "That email is already in use." });
      return;
    }

    const [updated] = await db
      .update(adminsTable)
      .set({ email: normalised, updatedAt: new Date() })
      .where(eq(adminsTable.email, currentEmail))
      .returning({ email: adminsTable.email });

    if (!updated) {
      res.status(404).json({ error: "Admin not found." });
      return;
    }

    logger.info({ from: currentEmail, to: normalised }, "Admin email updated");
    res.json({ ok: true, email: updated.email });
  } catch {
    res.status(500).json({ error: "Failed to update profile." });
  }
});

router.post("/admin/change-password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: "currentPassword and newPassword (min 8 chars) are required." });
    return;
  }
  const header = req.headers.authorization ?? "";
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const email = decoded.slice(0, decoded.indexOf(":")).toLowerCase();
  try {
    const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.email, email)).limit(1);
    if (!admin) { res.status(404).json({ error: "Admin not found." }); return; }
    const valid = await comparePassword(String(currentPassword), admin.passwordHash);
    if (!valid) { res.status(400).json({ error: "Current password is incorrect." }); return; }
    const passwordHash = await hashPassword(String(newPassword));
    await db.update(adminsTable).set({ passwordHash, updatedAt: new Date() }).where(eq(adminsTable.id, admin.id));
    logger.info({ email }, "Admin password changed");
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Failed to update password." }); }
});

router.get("/admin", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(ADMIN_HTML);
});


const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Gym Admin Panel</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#f0f4ff;min-height:100vh;color:#0f172a}
/* ---- Login ---- */
.login-screen{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-card{background:#fff;border-radius:20px;padding:40px;width:100%;max-width:420px;box-shadow:0 8px 40px rgba(59,130,246,0.13);border:1px solid #e2e8f0}
.login-icon{width:64px;height:64px;background:#eff6ff;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px}
.login-title{font-size:22px;font-weight:700;text-align:center;margin-bottom:4px}
.login-sub{font-size:14px;color:#64748b;text-align:center;margin-bottom:28px}
/* ---- Nav ---- */
nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:0 28px;display:flex;align-items:center;height:58px;gap:0;position:sticky;top:0;z-index:10}
.nav-brand{font-weight:800;font-size:16px;color:#3b82f6;margin-right:28px;display:flex;align-items:center;gap:8px}
.nav-btn{padding:8px 18px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:500;color:#64748b;border-bottom:2px solid transparent;height:58px;transition:color .15s}
.nav-btn.active{color:#3b82f6;border-bottom-color:#3b82f6}
.nav-btn:hover{color:#3b82f6}
.logout{margin-left:auto;padding:8px 16px;background:#fee2e2;color:#ef4444;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
/* ---- Pages ---- */
.page{display:none;padding:28px;max-width:1200px;margin:0 auto}
.page.active{display:block}
.page-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.page-header h2{font-size:22px;font-weight:700;margin-bottom:2px}
.page-header .subtitle{color:#64748b;font-size:14px}
/* ---- Stats ---- */
.stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.stat{background:#fff;border-radius:14px;padding:18px 22px;border:1px solid #e2e8f0;min-width:130px;flex:1}
.stat-val{font-size:30px;font-weight:800;color:#3b82f6;line-height:1}
.stat-label{font-size:12px;color:#64748b;margin-top:4px;font-weight:500}
/* ---- Toolbar ---- */
.toolbar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.search{flex:1;min-width:200px;padding:10px 16px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;background:#fff;font-family:inherit}
.search:focus{outline:none;border-color:#3b82f6}
.page-info{font-size:13px;color:#94a3b8;white-space:nowrap;align-self:center}
/* ---- Table ---- */
.table-wrap{overflow-x:auto;border-radius:14px;border:1px solid #e2e8f0;background:#fff}
table{width:100%;border-collapse:collapse;min-width:700px}
th{text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;background:#f8faff;border-bottom:1px solid #e2e8f0;white-space:nowrap}
td{padding:13px 16px;font-size:14px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8faff}
/* ---- Badges ---- */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-active{background:#d1fae5;color:#059669}
.badge-expired{background:#fee2e2;color:#ef4444}
.badge-none{background:#f1f5f9;color:#94a3b8}
/* ---- Buttons ---- */
.btn{padding:7px 14px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-blue{background:#3b82f6;color:#fff}
.btn-red{background:#fee2e2;color:#ef4444;border:1px solid #fecaca}
.btn-ghost{background:#f1f5f9;color:#475569}
.btn-group{display:flex;gap:6px}
/* ---- Pagination ---- */
.pagination{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;flex-wrap:wrap}
.pg-btn{padding:6px 12px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:500;color:#475569}
.pg-btn:hover{border-color:#3b82f6;color:#3b82f6}
.pg-btn.active{background:#3b82f6;color:#fff;border-color:#3b82f6}
.pg-btn:disabled{opacity:.4;cursor:default}
/* ---- Forms ---- */
.form-label{display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px}
.form-input{width:100%;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;margin-bottom:14px;font-family:inherit}
.form-input:focus{outline:none;border-color:#3b82f6}
.form-input[readonly]{background:#f8faff;color:#3b82f6;font-family:Menlo,monospace;font-weight:700;letter-spacing:2px}
/* ---- Modal ---- */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:100;align-items:center;justify-content:center;padding:16px}
.modal-overlay.show{display:flex}
.modal{background:#fff;border-radius:18px;padding:30px;width:100%;max-width:460px;box-shadow:0 24px 64px rgba(0,0,0,0.18)}
.modal-title{font-size:18px;font-weight:700;margin-bottom:4px}
.modal-sub{color:#64748b;font-size:13px;margin-bottom:22px}
.btn-primary{width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:4px}
.btn-primary:hover{background:#2563eb}
.btn-cancel{width:100%;padding:12px;background:none;color:#64748b;border:1.5px solid #e2e8f0;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px}
.result-box{background:#eff6ff;border:2px solid #3b82f6;border-radius:12px;padding:16px;margin-top:16px;display:none}
.result-box.show{display:block}
.result-code{font-family:Menlo,monospace;font-size:17px;font-weight:700;color:#3b82f6;word-break:break-all;padding:10px;background:#fff;border-radius:8px;border:1px solid #bfdbfe;user-select:all;cursor:text}
.result-meta{font-size:12px;color:#64748b;margin-top:8px}
.copy-btn{width:100%;margin-top:10px;padding:10px;background:#10b981;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
.copy-btn.copied{background:#94a3b8}
/* ---- Settings card ---- */
.settings-card{background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:28px;max-width:480px}
.settings-card h3{font-size:16px;font-weight:700;margin-bottom:4px}
.settings-card .desc{font-size:13px;color:#64748b;margin-bottom:22px}
/* ---- Misc ---- */
.err{color:#ef4444;font-size:13px;margin-top:4px;min-height:18px}
.success{color:#059669;font-size:13px;margin-top:4px;min-height:18px}
.loading{text-align:center;padding:48px;color:#94a3b8}
.empty{text-align:center;padding:48px;color:#94a3b8;font-size:14px}
.mono{font-family:Menlo,monospace;font-weight:700;color:#3b82f6}
.danger-zone{border:1px solid #fecaca;border-radius:14px;padding:20px;margin-top:28px;background:#fff9f9}
.danger-zone h3{font-size:14px;font-weight:700;color:#ef4444;margin-bottom:4px}
.danger-zone p{font-size:13px;color:#94a3b8;margin-bottom:0}
</style>
</head>
<body>

<!-- Login Screen -->
<div id="login-screen" class="login-screen">
  <div class="login-card">
    <div class="login-icon">🏋️</div>
    <div class="login-title">Gym Admin Panel</div>
    <div class="login-sub">Sign in to manage gym owners and licenses</div>
    <label class="form-label">Email</label>
    <input id="login-email" class="form-input" type="email" placeholder="admin@example.com" autocomplete="username"/>
    <label class="form-label">Password</label>
    <input id="login-pass" class="form-input" type="password" placeholder="Your password" autocomplete="current-password"/>
    <button class="btn-primary" id="login-btn" onclick="doLogin()">Sign In</button>
    <div id="login-err" class="err" style="text-align:center;margin-top:10px"></div>
  </div>
</div>

<!-- Main App -->
<div id="app" style="display:none">
<nav>
  <span class="nav-brand">🏋️ Gym Admin</span>
  <button class="nav-btn active" onclick="showPage('owners',this)">Gym Owners</button>
  <button class="nav-btn" onclick="showPage('licenses',this)">Licenses</button>
  <button class="nav-btn" onclick="showPage('settings',this)">Settings</button>
  <button class="logout" onclick="logout()">Sign Out</button>
</nav>

<!-- ===== Owners Page ===== -->
<div id="page-owners" class="page active">
  <div class="page-header">
    <div>
      <h2>Gym Owners</h2>
      <div class="subtitle">All registered gym owners — generate or manage activation codes</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val" id="stat-total">—</div><div class="stat-label">Total Owners</div></div>
    <div class="stat"><div class="stat-val" id="stat-active" style="color:#10b981">—</div><div class="stat-label">Activated</div></div>
    <div class="stat"><div class="stat-val" id="stat-expired" style="color:#ef4444">—</div><div class="stat-label">Expired</div></div>
    <div class="stat"><div class="stat-val" id="stat-none" style="color:#94a3b8">—</div><div class="stat-label">No Code</div></div>
  </div>
  <div class="toolbar">
    <input class="search" type="text" placeholder="Search by name, gym, email or Gym ID…" oninput="filterOwners(this.value)"/>
    <span class="page-info" id="owners-page-info"></span>
  </div>
  <div class="table-wrap">
    <div id="owners-table"><div class="loading">Loading…</div></div>
  </div>
  <div class="pagination" id="owners-pagination"></div>
</div>

<!-- ===== Licenses Page ===== -->
<div id="page-licenses" class="page">
  <div class="page-header">
    <div>
      <h2>License History</h2>
      <div class="subtitle">All generated activation codes — "Valid" means the code hasn't expired yet, not that the owner has activated it</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val" id="lic-active" style="color:#10b981">—</div><div class="stat-label">Active</div></div>
    <div class="stat"><div class="stat-val" id="lic-expired" style="color:#ef4444">—</div><div class="stat-label">Expired</div></div>
    <div class="stat"><div class="stat-val" id="lic-total">—</div><div class="stat-label">Total</div></div>
  </div>
  <div class="toolbar">
    <input class="search" type="text" placeholder="Search by Gym ID or code…" oninput="filterLicenses(this.value)"/>
    <span class="page-info" id="licenses-page-info"></span>
  </div>
  <div class="table-wrap">
    <div id="licenses-table"><div class="loading">Loading…</div></div>
  </div>
  <div class="pagination" id="licenses-pagination"></div>
</div>

<!-- ===== Settings Page ===== -->
<div id="page-settings" class="page">
  <div class="page-header">
    <div><h2>Settings</h2><div class="subtitle">Manage your admin account</div></div>
  </div>

  <!-- Edit Profile -->
  <div class="settings-card" style="margin-bottom:20px">
    <h3>Edit Profile</h3>
    <p class="desc">Update your admin login email.</p>
    <label class="form-label">Current Email</label>
    <input id="ep-current-email" class="form-input" type="email" readonly style="background:#f8faff;color:#64748b"/>
    <label class="form-label">New Email</label>
    <input id="ep-new-email" class="form-input" type="email" placeholder="new@example.com" autocomplete="email"/>
    <button class="btn-primary" onclick="updateProfile()" id="ep-btn">Update Email</button>
    <div id="ep-msg" class="err" style="text-align:center;margin-top:10px"></div>
  </div>

  <!-- Change Password -->
  <div class="settings-card">
    <h3>Change Password</h3>
    <p class="desc">Update your admin panel password. Minimum 8 characters.</p>
    <label class="form-label">Current Password</label>
    <input id="cp-current" class="form-input" type="password" placeholder="Current password" autocomplete="current-password"/>
    <label class="form-label">New Password</label>
    <input id="cp-new" class="form-input" type="password" placeholder="New password (min 8 chars)" autocomplete="new-password"/>
    <label class="form-label">Confirm New Password</label>
    <input id="cp-confirm" class="form-input" type="password" placeholder="Repeat new password" autocomplete="new-password"/>
    <button class="btn-primary" onclick="changePassword()" id="cp-btn">Update Password</button>
    <div id="cp-msg" class="err" style="text-align:center;margin-top:10px"></div>
  </div>
</div>

<!-- ===== Generate Code Modal ===== -->
<div id="modal" class="modal-overlay" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <div class="modal-title">Generate Activation Code</div>
    <div class="modal-sub" id="modal-sub"></div>
    <label class="form-label">Gym ID</label>
    <input id="modal-gymid" class="form-input" type="text" readonly/>
    <label class="form-label">Subscription Duration</label>
    <select id="modal-days" class="form-input" style="margin-bottom:16px">
      <option value="30">30 Days — 1 Month</option>
      <option value="90">90 Days — 3 Months</option>
      <option value="180">180 Days — 6 Months</option>
      <option value="365">365 Days — 1 Year</option>
    </select>
    <div id="modal-err" class="err"></div>
    <button class="btn-primary" onclick="generateCode()">Generate Code</button>
    <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    <div id="result-box" class="result-box">
      <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Activation Code</div>
      <div id="result-code" class="result-code"></div>
      <div id="result-meta" class="result-meta"></div>
      <button id="copy-btn" class="copy-btn" onclick="copyCode()">📋 Copy Code</button>
    </div>
  </div>
</div>

<!-- ===== Delete Owner Confirm Modal ===== -->
<div id="del-modal" class="modal-overlay" onclick="if(event.target===this)closeDelModal()">
  <div class="modal">
    <div class="modal-title" style="color:#ef4444">⚠ Delete Gym Owner</div>
    <div class="modal-sub" id="del-modal-sub"></div>
    <p style="font-size:14px;color:#475569;margin-bottom:20px;line-height:1.6">
      This will permanently delete the owner account and <strong>all their members, staff, and data</strong>. This cannot be undone.
    </p>
    <div id="del-err" class="err"></div>
    <button class="btn-primary" style="background:#ef4444" onclick="confirmDeleteOwner()" id="del-btn">Yes, Delete Permanently</button>
    <button class="btn-cancel" onclick="closeDelModal()">Cancel</button>
  </div>
</div>

<!-- ===== Revoke License Confirm Modal ===== -->
<div id="rev-modal" class="modal-overlay" onclick="if(event.target===this)closeRevModal()">
  <div class="modal">
    <div class="modal-title" style="color:#ef4444">Revoke License</div>
    <div class="modal-sub" id="rev-modal-sub"></div>
    <p style="font-size:14px;color:#475569;margin-bottom:20px;line-height:1.6">
      The gym owner will lose access immediately. You can generate a new code for them at any time.
    </p>
    <div id="rev-err" class="err"></div>
    <button class="btn-primary" style="background:#ef4444" onclick="confirmRevokeLicense()" id="rev-btn">Revoke License</button>
    <button class="btn-cancel" onclick="closeRevModal()">Cancel</button>
  </div>
</div>

</div><!-- end app -->

<script>
const PAGE_SIZE = 50;
let allOwners = [], filteredOwners = [], allLicenses = [], filteredLicenses = [];
let ownerPage = 1, licensePage = 1;
let pendingDeleteId = null, pendingRevokeId = null;

// ---- Auth ----
function getAuthHeader() { return sessionStorage.getItem('gym_admin_auth') || ''; }
function isLoggedIn() { return !!getAuthHeader(); }

function showLogin(msg) {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  if (msg) document.getElementById('login-err').textContent = msg;
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadAll();
}
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) { document.getElementById('login-err').textContent = 'Please enter email and password.'; return; }
  const header = 'Basic ' + btoa(email + ':' + pass);
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    const res = await fetch('/api/admin/owners', { headers: { Authorization: header } });
    if (res.status === 401) { document.getElementById('login-err').textContent = 'Invalid email or password.'; btn.textContent = 'Sign In'; btn.disabled = false; return; }
    sessionStorage.setItem('gym_admin_auth', header);
    btn.textContent = 'Sign In'; btn.disabled = false;
    showApp();
  } catch { document.getElementById('login-err').textContent = 'Network error.'; btn.textContent = 'Sign In'; btn.disabled = false; }
}
function logout() { sessionStorage.removeItem('gym_admin_auth'); showLogin(''); }

// ---- Navigation ----
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'licenses') renderLicenses();
  if (name === 'settings') populateProfileEmail();
}

// ---- API helper ----
async function apiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}), Authorization: getAuthHeader() };
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  return res;
}

// ---- Load all data ----
async function loadAll() {
  try {
    const [oRes, lRes] = await Promise.all([apiFetch('/api/admin/owners'), apiFetch('/api/admin/licenses')]);
    allOwners = (await oRes.json()).owners || [];
    allLicenses = (await lRes.json()).licenses || [];
    filteredOwners = allOwners;
    filteredLicenses = allLicenses;
    ownerPage = 1; licensePage = 1;
    renderOwners(); renderLicenseStats();
  } catch(e) {
    if (e.message !== 'Unauthorized') document.getElementById('owners-table').innerHTML = '<div class="empty">Failed to load. <a href="#" onclick="loadAll()">Retry</a></div>';
  }
}

// ---- Owner status helpers ----
function getOwnerStatus(gymId) {
  const lics = allLicenses.filter(l => l.gymId === gymId);
  if (!lics.length) return 'none';
  const latest = lics.sort((a,b) => new Date(b.expiryDate) - new Date(a.expiryDate))[0];
  if (new Date(latest.expiryDate) < new Date()) return 'expired';
  return latest.activatedAt ? 'activated' : 'pending';
}
function getOwnerExpiry(gymId) {
  const lics = allLicenses.filter(l => l.gymId === gymId);
  if (!lics.length) return null;
  return lics.sort((a,b) => new Date(b.expiryDate) - new Date(a.expiryDate))[0].expiryDate;
}
function statusBadge(status) {
  if (status === 'activated') return '<span class="badge badge-active">● Activated</span>';
  if (status === 'pending') return '<span class="badge" style="background:#fef9c3;color:#b45309">● Pending Activation</span>';
  if (status === 'expired') return '<span class="badge badge-expired">● Expired</span>';
  return '<span class="badge badge-none">No Code</span>';
}

// ---- Render owners ----
function renderOwners() {
  const active = allOwners.filter(o => getOwnerStatus(o.gymId) === 'activated').length;
  const expired = allOwners.filter(o => getOwnerStatus(o.gymId) === 'expired').length;
  const none = allOwners.filter(o => getOwnerStatus(o.gymId) === 'none').length;
  document.getElementById('stat-total').textContent = allOwners.length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-expired').textContent = expired;
  document.getElementById('stat-none').textContent = none;

  const total = filteredOwners.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (ownerPage > pages) ownerPage = pages;
  const start = (ownerPage - 1) * PAGE_SIZE;
  const slice = filteredOwners.slice(start, start + PAGE_SIZE);

  document.getElementById('owners-page-info').textContent = total ? \`Showing \${start+1}–\${Math.min(start+PAGE_SIZE,total)} of \${total}\` : '';

  if (!slice.length) { document.getElementById('owners-table').innerHTML = '<div class="empty">No gym owners found.</div>'; renderPagination('owners', pages); return; }

  let html = '<table><thead><tr><th>Owner</th><th>Gym Name</th><th>Gym ID</th><th>Phone</th><th>Registered</th><th>License Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  for (const o of slice) {
    const status = getOwnerStatus(o.gymId);
    const expiry = getOwnerExpiry(o.gymId);
    html += \`<tr>
      <td><strong>\${esc(o.name)}</strong></td>
      <td>\${esc(o.gymName)}</td>
      <td><span class="mono">\${esc(o.gymId)}</span></td>
      <td>\${esc(o.phone || '—')}</td>
      <td>\${new Date(o.createdAt).toLocaleDateString()}</td>
      <td>\${expiry ? new Date(expiry).toLocaleDateString() : '—'}</td>
      <td>\${statusBadge(status)}</td>
      <td><div class="btn-group">
        <button class="btn btn-blue" onclick="openModal('\${esc(o.gymId)}','\${esc(o.name)}','\${esc(o.gymName)}')">Generate</button>
        <button class="btn btn-red" onclick="openDelModal('\${esc(o.id)}','\${esc(o.name)}','\${esc(o.gymName)}')">Delete</button>
      </div></td>
    </tr>\`;
  }
  html += '</tbody></table>';
  document.getElementById('owners-table').innerHTML = html;
  renderPagination('owners', pages);
}

function filterOwners(q) {
  const lower = q.toLowerCase();
  filteredOwners = allOwners.filter(o =>
    o.name.toLowerCase().includes(lower) || o.gymName.toLowerCase().includes(lower) ||
    o.gymId.toLowerCase().includes(lower) || o.email.toLowerCase().includes(lower)
  );
  ownerPage = 1;
  renderOwners();
}

// ---- Render licenses ----
function renderLicenseStats() {
  const now = new Date();
  document.getElementById('lic-active').textContent = allLicenses.filter(l => new Date(l.expiryDate) >= now).length;
  document.getElementById('lic-expired').textContent = allLicenses.filter(l => new Date(l.expiryDate) < now).length;
  document.getElementById('lic-total').textContent = allLicenses.length;
}

function renderLicenses() {
  renderLicenseStats();
  const now = new Date();
  const total = filteredLicenses.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (licensePage > pages) licensePage = pages;
  const start = (licensePage - 1) * PAGE_SIZE;
  const slice = filteredLicenses.slice(start, start + PAGE_SIZE);

  document.getElementById('licenses-page-info').textContent = total ? \`Showing \${start+1}–\${Math.min(start+PAGE_SIZE,total)} of \${total}\` : '';

  if (!slice.length) { document.getElementById('licenses-table').innerHTML = '<div class="empty">No licenses found.</div>'; renderPagination('licenses', pages); return; }

  let html = '<table><thead><tr><th>Gym ID</th><th>Activation Code</th><th>Expires</th><th>Generated</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  for (const l of slice) {
    const isActive = new Date(l.expiryDate) >= now;
    html += \`<tr>
      <td><span class="mono">\${esc(l.gymId)}</span></td>
      <td><code style="font-family:Menlo,monospace;font-size:13px">\${esc(l.code)}</code></td>
      <td>\${new Date(l.expiryDate).toLocaleDateString()}</td>
      <td>\${new Date(l.createdAt).toLocaleDateString()}</td>
      <td>\${isActive && l.activatedAt ? '<span class="badge badge-active">● Activated</span>' : isActive ? '<span class="badge" style="background:#fef9c3;color:#b45309">● Pending</span>' : '<span class="badge badge-expired">● Expired</span>'}</td>
      <td>\${isActive ? \`<button class="btn btn-red" onclick="openRevModal(\${l.id},'\${esc(l.gymId)}','\${esc(l.code)}')">Revoke</button>\` : '<span style="color:#94a3b8;font-size:13px">—</span>'}</td>
    </tr>\`;
  }
  html += '</tbody></table>';
  document.getElementById('licenses-table').innerHTML = html;
  renderPagination('licenses', pages);
}

function filterLicenses(q) {
  const lower = q.toLowerCase();
  filteredLicenses = allLicenses.filter(l => l.gymId.toLowerCase().includes(lower) || l.code.toLowerCase().includes(lower));
  licensePage = 1;
  renderLicenses();
}

// ---- Pagination ----
function renderPagination(type, pages) {
  const current = type === 'owners' ? ownerPage : licensePage;
  const el = document.getElementById(type + '-pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }
  let html = \`<button class="pg-btn" onclick="goPage('\${type}',\${current-1})" \${current===1?'disabled':''}>‹ Prev</button>\`;
  const range = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= current - 2 && i <= current + 2)) range.push(i);
    else if (range[range.length-1] !== '…') range.push('…');
  }
  for (const p of range) {
    if (p === '…') html += '<span style="padding:6px 4px;color:#94a3b8">…</span>';
    else html += \`<button class="pg-btn \${p===current?'active':''}" onclick="goPage('\${type}',\${p})">\${p}</button>\`;
  }
  html += \`<button class="pg-btn" onclick="goPage('\${type}',\${current+1})" \${current===pages?'disabled':''}>Next ›</button>\`;
  el.innerHTML = html;
}

function goPage(type, page) {
  if (type === 'owners') { ownerPage = page; renderOwners(); }
  else { licensePage = page; renderLicenses(); }
  document.getElementById('page-' + (type === 'owners' ? 'owners' : 'licenses')).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Generate code modal ----
function openModal(gymId, name, gymName) {
  document.getElementById('modal-gymid').value = gymId;
  document.getElementById('modal-sub').textContent = name + ' — ' + gymName;
  document.getElementById('modal-err').textContent = '';
  document.getElementById('result-box').classList.remove('show');
  document.getElementById('modal').classList.add('show');
}
function closeModal() { document.getElementById('modal').classList.remove('show'); }

async function generateCode() {
  const gymId = document.getElementById('modal-gymid').value;
  const days = parseInt(document.getElementById('modal-days').value);
  const errEl = document.getElementById('modal-err');
  errEl.textContent = '';
  const btn = document.querySelector('#modal .btn-primary');
  if (btn) { btn.textContent = 'Generating…'; btn.disabled = true; }
  try {
    const res = await apiFetch('/api/admin/generate-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gymId, days }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed'; return; }

    // Show the result immediately
    document.getElementById('result-code').textContent = data.code;
    document.getElementById('result-meta').innerHTML = '<strong>Valid until:</strong> ' + data.expiryDate + ' (' + data.days + ' days)';
    document.getElementById('result-box').classList.add('show');
    document.getElementById('copy-btn').textContent = '📋 Copy Code';
    document.getElementById('copy-btn').classList.remove('copied');

    // Refresh license list in the background — don't let it block the result display
    apiFetch('/api/admin/licenses').then(r => r.json()).then(d => {
      allLicenses = d.licenses || [];
      filteredLicenses = allLicenses;
      renderOwners();
      renderLicenseStats();
    }).catch(() => {});
  } catch(e) {
    if (e.message !== 'Unauthorized') errEl.textContent = 'Network error. Please try again.';
  } finally {
    if (btn) { btn.textContent = 'Generate Code'; btn.disabled = false; }
  }
}

async function copyCode() {
  const code = document.getElementById('result-code').textContent;
  try {
    await navigator.clipboard.writeText(code);
    const btn = document.getElementById('copy-btn');
    btn.textContent = '✅ Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy Code'; btn.classList.remove('copied'); }, 2000);
  } catch {}
}

// ---- Delete owner modal ----
function openDelModal(id, name, gymName) {
  pendingDeleteId = id;
  document.getElementById('del-modal-sub').textContent = name + ' — ' + gymName;
  document.getElementById('del-err').textContent = '';
  document.getElementById('del-btn').textContent = 'Yes, Delete Permanently';
  document.getElementById('del-btn').disabled = false;
  document.getElementById('del-modal').classList.add('show');
}
function closeDelModal() { document.getElementById('del-modal').classList.remove('show'); pendingDeleteId = null; }

async function confirmDeleteOwner() {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('del-btn');
  btn.textContent = 'Deleting…'; btn.disabled = true;
  try {
    const res = await apiFetch('/api/admin/owners/' + pendingDeleteId, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); document.getElementById('del-err').textContent = d.error || 'Failed'; btn.textContent = 'Yes, Delete Permanently'; btn.disabled = false; return; }
    closeDelModal();
    await loadAll();
  } catch(e) { if (e.message !== 'Unauthorized') { document.getElementById('del-err').textContent = 'Network error.'; btn.textContent = 'Yes, Delete Permanently'; btn.disabled = false; } }
}

// ---- Revoke license modal ----
function openRevModal(id, gymId, code) {
  pendingRevokeId = id;
  document.getElementById('rev-modal-sub').textContent = 'Gym ID: ' + gymId + ' — Code: ' + code;
  document.getElementById('rev-err').textContent = '';
  document.getElementById('rev-btn').textContent = 'Revoke License';
  document.getElementById('rev-btn').disabled = false;
  document.getElementById('rev-modal').classList.add('show');
}
function closeRevModal() { document.getElementById('rev-modal').classList.remove('show'); pendingRevokeId = null; }

async function confirmRevokeLicense() {
  if (!pendingRevokeId) return;
  const btn = document.getElementById('rev-btn');
  btn.textContent = 'Revoking…'; btn.disabled = true;
  try {
    const res = await apiFetch('/api/admin/licenses/' + pendingRevokeId, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); document.getElementById('rev-err').textContent = d.error || 'Failed'; btn.textContent = 'Revoke License'; btn.disabled = false; return; }
    closeRevModal();
    await loadAll();
    renderLicenses();
  } catch(e) { if (e.message !== 'Unauthorized') { document.getElementById('rev-err').textContent = 'Network error.'; btn.textContent = 'Revoke License'; btn.disabled = false; } }
}

// ---- Profile ----
function populateProfileEmail() {
  const header = getAuthHeader();
  if (!header) return;
  try {
    const decoded = atob(header.slice(6));
    const email = decoded.slice(0, decoded.indexOf(':'));
    document.getElementById('ep-current-email').value = email;
    document.getElementById('ep-new-email').value = '';
    document.getElementById('ep-msg').textContent = '';
    document.getElementById('ep-msg').className = 'err';
  } catch {}
}

async function updateProfile() {
  const newEmail = document.getElementById('ep-new-email').value.trim();
  const msg = document.getElementById('ep-msg');
  msg.className = 'err'; msg.textContent = '';
  if (!newEmail || !newEmail.includes('@')) { msg.textContent = 'Please enter a valid email address.'; return; }
  const btn = document.getElementById('ep-btn');
  btn.textContent = 'Updating…'; btn.disabled = true;
  try {
    const res = await apiFetch('/api/admin/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newEmail }) });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || 'Failed.'; btn.textContent = 'Update Email'; btn.disabled = false; return; }
    // Update stored auth header with new email
    const header = getAuthHeader();
    const decoded = atob(header.slice(6));
    const password = decoded.slice(decoded.indexOf(':') + 1);
    sessionStorage.setItem('gym_admin_auth', 'Basic ' + btoa(data.email + ':' + password));
    document.getElementById('ep-current-email').value = data.email;
    document.getElementById('ep-new-email').value = '';
    msg.className = 'success'; msg.textContent = '✓ Email updated to ' + data.email;
  } catch(e) { if (e.message !== 'Unauthorized') msg.textContent = 'Network error.'; }
  btn.textContent = 'Update Email'; btn.disabled = false;
}

// ---- Change password ----
async function changePassword() {
  const current = document.getElementById('cp-current').value;
  const newPwd = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-confirm').value;
  const msg = document.getElementById('cp-msg');
  msg.className = 'err'; msg.style.textAlign = 'center'; msg.textContent = '';
  if (!current || !newPwd || !confirm) { msg.textContent = 'All fields are required.'; return; }
  if (newPwd.length < 8) { msg.textContent = 'New password must be at least 8 characters.'; return; }
  if (newPwd !== confirm) { msg.textContent = 'New passwords do not match.'; return; }
  const btn = document.getElementById('cp-btn');
  btn.textContent = 'Updating…'; btn.disabled = true;
  try {
    const res = await apiFetch('/api/admin/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: newPwd }) });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || 'Failed.'; btn.textContent = 'Update Password'; btn.disabled = false; return; }
    // Update stored auth header with new password
    const decoded = atob(getAuthHeader().slice(6));
    const email = decoded.slice(0, decoded.indexOf(':'));
    sessionStorage.setItem('gym_admin_auth', 'Basic ' + btoa(email + ':' + newPwd));
    msg.className = 'success'; msg.textContent = '✓ Password updated successfully.';
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value = '';
    document.getElementById('cp-confirm').value = '';
  } catch(e) { if (e.message !== 'Unauthorized') msg.textContent = 'Network error.'; }
  btn.textContent = 'Update Password'; btn.disabled = false;
}

// ---- Utilities ----
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ---- Init ----
if (isLoggedIn()) { showApp(); populateProfileEmail(); } else { showLogin(''); }
document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
</script>
</body>
</html>`;

export default router;
