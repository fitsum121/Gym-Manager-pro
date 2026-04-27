import { Router } from "express";
import { z } from "zod";
import { db, staffTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { hashPin, comparePin } from "../lib/hash";
import { signToken } from "../lib/jwt";
import { authenticate } from "../middlewares/authenticate";
import { requireRole } from "../middlewares/requireRole";

const router = Router();

const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 numeric digits.");
const staffNameSchema = z.string().min(1, "Name is required.").max(100, "Name must be 100 characters or fewer.");
const usernameSchema = z
  .string()
  .min(2, "Username must be at least 2 characters.")
  .max(30, "Username must be 30 characters or fewer.")
  .regex(/^[a-z0-9_]+$/, "Username may only contain lowercase letters, numbers, and underscores.");

// POST /staff/login — public
router.post("/login", async (req, res) => {
  const schema = z.object({
    gymId: z.string().min(1),
    username: z.string().min(1),
    pin: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const { gymId, username, pin } = parsed.data;
  const GENERIC_ERROR = "Invalid Gym ID, username, or PIN.";

  try {
    // Fetch exactly one staff record by (gymId, username) — O(1), no loop needed.
    const [staff] = await db
      .select()
      .from(staffTable)
      .where(
        and(
          eq(staffTable.gymId, gymId.toUpperCase()),
          eq(staffTable.username, username.toLowerCase()),
        ),
      )
      .limit(1);

    if (!staff) {
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    const valid = await comparePin(pin, staff.pinHash);
    if (!valid) {
      res.status(401).json({ error: GENERIC_ERROR });
      return;
    }

    const token = signToken({ sub: staff.id, gymId: staff.gymId, role: "staff", name: staff.name });

    res.json({
      token,
      staff: { id: staff.id, gymId: staff.gymId, name: staff.name, role: "staff" },
    });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /staff — owner only
router.get("/", authenticate, requireRole("owner"), async (req, res) => {
  try {
    const staffList = await db.select({
      id: staffTable.id,
      gymId: staffTable.gymId,
      name: staffTable.name,
      username: staffTable.username,
      createdAt: staffTable.createdAt,
    }).from(staffTable).where(eq(staffTable.gymId, req.user!.gymId));

    res.json({ staff: staffList });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /staff — owner only
router.post("/", authenticate, requireRole("owner"), async (req, res) => {
  const schema = z.object({
    name: staffNameSchema,
    username: usernameSchema,
    pin: pinSchema,
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation failed.", details: parsed.error.issues });
    return;
  }

  const { name, username, pin } = parsed.data;

  try {
    // Check username uniqueness within this gym
    const [existing] = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .where(and(eq(staffTable.gymId, req.user!.gymId), eq(staffTable.username, username.toLowerCase())))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "A staff member with this username already exists." });
      return;
    }

    const pinHash = await hashPin(pin);
    const [created] = await db.insert(staffTable).values({
      gymId: req.user!.gymId,
      name,
      username: username.toLowerCase(),
      pinHash,
    }).returning({ id: staffTable.id, gymId: staffTable.gymId, name: staffTable.name, username: staffTable.username, createdAt: staffTable.createdAt });

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// PATCH /staff/:staffId — owner only
router.patch("/:staffId", authenticate, requireRole("owner"), async (req, res) => {
  const { staffId } = req.params as { staffId: string };

  const schema = z.object({
    name: staffNameSchema.optional(),
    username: usernameSchema.optional(),
    pin: pinSchema.optional(),
  }).refine((d) => d.name || d.username || d.pin, {
    message: "At least one field (name, username, or pin) must be provided.",
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation failed." });
    return;
  }

  const { name, username, pin } = parsed.data;

  try {
    // Verify the staff member belongs to this gym
    const [existing] = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .where(and(eq(staffTable.id, staffId), eq(staffTable.gymId, req.user!.gymId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Staff member not found." });
      return;
    }

    // If changing username, check it's not taken by another staff in this gym
    if (username) {
      const [conflict] = await db
        .select({ id: staffTable.id })
        .from(staffTable)
        .where(and(
          eq(staffTable.gymId, req.user!.gymId),
          eq(staffTable.username, username.toLowerCase()),
        ))
        .limit(1);

      if (conflict && conflict.id !== staffId) {
        res.status(409).json({ error: "A staff member with this username already exists." });
        return;
      }
    }

    const updates: Partial<typeof staffTable.$inferInsert> = {};
    if (name) updates.name = name;
    if (username) updates.username = username.toLowerCase();
    if (pin) updates.pinHash = await hashPin(pin);

    const [updated] = await db
      .update(staffTable)
      .set(updates)
      .where(and(eq(staffTable.id, staffId), eq(staffTable.gymId, req.user!.gymId)))
      .returning({
        id: staffTable.id,
        gymId: staffTable.gymId,
        name: staffTable.name,
        username: staffTable.username,
        createdAt: staffTable.createdAt,
      });

    res.json(updated);
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// DELETE /staff/:staffId — owner only
router.delete("/:staffId", authenticate, requireRole("owner"), async (req, res) => {
  const { staffId } = req.params as { staffId: string };

  try {
    const deleted = await db.delete(staffTable)
      .where(and(eq(staffTable.id, staffId), eq(staffTable.gymId, req.user!.gymId)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Staff member not found." });
      return;
    }

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
