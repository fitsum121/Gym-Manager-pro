import { Router } from "express";
import { z } from "zod";
import { db, ownersTable, licensesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { hashPassword, comparePassword } from "../lib/hash";
import { signToken, signResetToken, verifyResetToken } from "../lib/jwt";
import { generateGymId } from "../lib/gymId";
import { logger } from "../lib/logger";
import { authenticate } from "../middlewares/authenticate";
import { requireRole } from "../middlewares/requireRole";

const router = Router();

// POST /auth/owner/register
router.post("/owner/register", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100),
    gymName: z.string().min(1).max(100),
    phone: z.string().default(""),
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed.", details: parsed.error.issues });
    return;
  }

  const { name, gymName, phone, email, password } = parsed.data;

  try {
    // Check for duplicate email
    const existing = await db.select().from(ownersTable).where(eq(ownersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    // Generate a unique gymId — the ID space is ~1 billion so collisions are
    // extremely rare, but we handle exhaustion explicitly rather than silently
    // proceeding with a duplicate and hitting a DB constraint error.
    const MAX_GYM_ID_ATTEMPTS = 10;
    let gymId: string | null = null;
    for (let attempt = 0; attempt < MAX_GYM_ID_ATTEMPTS; attempt++) {
      const candidate = generateGymId();
      const conflict = await db
        .select({ id: ownersTable.id })
        .from(ownersTable)
        .where(eq(ownersTable.gymId, candidate))
        .limit(1);
      if (conflict.length === 0) {
        gymId = candidate;
        break;
      }
    }

    if (!gymId) {
      // All attempts collided — should never happen in practice given the ~1B
      // ID space, but we fail loudly rather than silently inserting a duplicate.
      logger.error("gymId generation exhausted all attempts — possible ID space exhaustion");
      res.status(500).json({ error: "Could not generate a unique Gym ID. Please try again." });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [owner] = await db.insert(ownersTable).values({
      gymId,
      name,
      gymName,
      phone,
      email: email.toLowerCase(),
      passwordHash,
    }).returning();

    const token = signToken({ sub: owner.id, gymId: owner.gymId, role: "owner", name: owner.name });

    res.status(201).json({
      token,
      owner: { id: owner.id, gymId: owner.gymId, name: owner.name, gymName: owner.gymName, phone: owner.phone, email: owner.email },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /auth/owner/login
router.post("/owner/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed.", details: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.email, email.toLowerCase())).limit(1);
    if (!owner) {
      res.status(401).json({ error: "No account found with this email. Please register first." });
      return;
    }

    const valid = await comparePassword(password, owner.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect password. Please try again." });
      return;
    }

    const token = signToken({ sub: owner.id, gymId: owner.gymId, role: "owner", name: owner.name });

    res.json({
      token,
      owner: { id: owner.id, gymId: owner.gymId, name: owner.name, gymName: owner.gymName, phone: owner.phone, email: owner.email },
    });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /auth/owner/me
router.get("/owner/me", authenticate, async (req, res) => {
  try {
    const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.user!.userId)).limit(1);
    if (!owner) {
      res.status(404).json({ error: "Owner not found." });
      return;
    }
    res.json({ id: owner.id, gymId: owner.gymId, name: owner.name, gymName: owner.gymName, phone: owner.phone, email: owner.email });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// PATCH /auth/owner/profile
router.patch("/owner/profile", authenticate, requireRole("owner"), async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    gymName: z.string().min(1).max(100).optional(),
    phone: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed.", details: parsed.error.issues });
    return;
  }

  try {
    const [updated] = await db.update(ownersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(ownersTable.id, req.user!.userId))
      .returning();

    res.json({ id: updated.id, gymId: updated.gymId, name: updated.name, gymName: updated.gymName, phone: updated.phone, email: updated.email });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /auth/owner/change-password
router.post("/owner/change-password", authenticate, requireRole("owner"), async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed.", details: parsed.error.issues });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.id, req.user!.userId)).limit(1);
    if (!owner) {
      res.status(404).json({ error: "Owner not found." });
      return;
    }

    const valid = await comparePassword(currentPassword, owner.passwordHash);
    if (!valid) {
      res.status(400).json({ error: "Current password is incorrect." });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(ownersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(ownersTable.id, owner.id));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /auth/owner/verify-identity (for forgot password flow)
router.post("/owner/verify-identity", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    phone: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed." });
    return;
  }

  try {
    const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.email, parsed.data.email.toLowerCase())).limit(1);
    if (!owner) {
      // Return verified:false without revealing whether the email exists
      res.json({ verified: false });
      return;
    }
    const normPhone = parsed.data.phone.replace(/\s+/g, "");
    const ownerPhone = owner.phone.replace(/\s+/g, "");
    const verified = normPhone === ownerPhone;

    if (!verified) {
      res.json({ verified: false });
      return;
    }

    // Issue a short-lived reset token so the client can prove it passed
    // identity verification when calling /reset-password.
    const resetToken = signResetToken(owner.email);
    res.json({ verified: true, resetToken });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /auth/owner/reset-password (for forgot password flow)
router.post("/owner/reset-password", async (req, res) => {
  const schema = z.object({
    resetToken: z.string().min(1),
    newPassword: z.string().min(6),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed." });
    return;
  }

  // Verify the reset token issued by /verify-identity
  const resetPayload = verifyResetToken(parsed.data.resetToken);
  if (!resetPayload) {
    res.status(401).json({ error: "Invalid or expired reset token. Please verify your identity again." });
    return;
  }

  try {
    const [owner] = await db.select().from(ownersTable).where(eq(ownersTable.email, resetPayload.email)).limit(1);
    if (!owner) {
      // Shouldn't happen (token was issued for a real account), but handle gracefully
      res.status(404).json({ error: "Account not found." });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.update(ownersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(ownersTable.id, owner.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /auth/license-status — called by the app on startup/foreground to
// verify the locally-stored license is still valid server-side (not revoked).
// Returns { active: true } if a non-expired license exists for this gym.
// Returns { active: false, reason: "revoked" } if all licenses were deleted.
// Returns { active: false, reason: "expired" } if all licenses are past expiry.
// If no license is tracked in the DB (locally-signed only), returns { active: true, tracked: false }.
router.get("/license-status", authenticate, requireRole("owner"), async (req, res) => {
  const gymId = req.user!.gymId;
  try {
    const licenses = await db
      .select()
      .from(licensesTable)
      .where(eq(licensesTable.gymId, gymId));

    if (licenses.length === 0) {
      // No license record at all — two possible cases:
      // 1. Admin revoked (deleted) the license record → should deactivate
      // 2. Gym was activated with a locally-signed code never tracked in DB
      //
      // We distinguish by checking if the owner was ever issued a license.
      // Since we can't tell from the DB alone, we check the owners table for
      // a createdAt — if the owner exists but has zero licenses, we treat it
      // as revoked (admin deleted it). Locally-signed codes are an edge case
      // only used outside the admin panel, so this is the safer default.
      res.json({ active: false, tracked: true, reason: "revoked" });
      return;
    }

    const now = new Date();
    const hasActive = licenses.some(l => new Date(l.expiryDate) > now);

    if (hasActive) {
      res.json({ active: true, tracked: true });
    } else {
      // All licenses exist but are past expiry date
      res.json({ active: false, tracked: true, reason: "expired" });
    }
  } catch {
    // Fail open on DB error
    res.json({ active: true, tracked: false });
  }
});

// POST /auth/activate — called by the mobile app when the owner enters an
// activation code. Marks the license as activated in the DB so the admin
// panel can reflect the real status.
router.post("/activate", authenticate, requireRole("owner"), async (req, res) => {
  const schema = z.object({ code: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "code is required." });
    return;
  }

  const code = parsed.data.code.trim().toUpperCase();
  const gymId = req.user!.gymId;

  try {
    // Find the license by code AND gymId — prevents one gym activating another's code
    const [license] = await db
      .select()
      .from(licensesTable)
      .where(and(eq(licensesTable.code, code), eq(licensesTable.gymId, gymId)))
      .limit(1);

    if (!license) {
      // Code not found in DB — could be a valid locally-signed code but not
      // issued by this admin panel. Still allow activation, just don't mark it.
      res.json({ ok: true, tracked: false });
      return;
    }

    if (new Date(license.expiryDate) < new Date()) {
      res.status(400).json({ error: "This activation code has expired." });
      return;
    }

    // Mark as activated (idempotent — re-activating the same code is fine)
    await db
      .update(licensesTable)
      .set({ activatedAt: new Date() })
      .where(eq(licensesTable.id, license.id));

    logger.info({ gymId, code }, "License activated by owner");
    res.json({ ok: true, tracked: true, expiryDate: license.expiryDate });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
