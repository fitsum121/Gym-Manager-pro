import { Router } from "express";
import { z } from "zod";
import { db, membersTable } from "@workspace/db";
import type { Member } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { authenticate } from "../middlewares/authenticate";

const router = Router();

// All member routes require authentication
router.use(authenticate);

/**
 * Normalise a Drizzle member row for JSON responses.
 * Drizzle returns `numeric` columns as strings; we coerce `paymentAmount` to a
 * number here so every response has a consistent numeric type and callers never
 * need to parseFloat.
 */
function serializeMember(m: Member) {
  return {
    ...m,
    paymentAmount: parseFloat(m.paymentAmount ?? "0"),
  };
}

function computeNewExpiry(currentExpiry: Date, membershipType: string): Date {
  const now = new Date();
  const baseDate = currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(baseDate);
  if (membershipType === "weekly") {
    newExpiry.setDate(newExpiry.getDate() + 7);
  } else if (membershipType === "monthly") {
    newExpiry.setMonth(newExpiry.getMonth() + 1);
  } else if (membershipType === "quarterly") {
    newExpiry.setMonth(newExpiry.getMonth() + 3);
  } else if (membershipType === "yearly") {
    newExpiry.setMonth(newExpiry.getMonth() + 12);
  }
  return newExpiry;
}

// POST /members/cleanup — explicitly purge members expired 7+ days ago
// Must be declared before /:memberId to avoid route shadowing.
router.post("/cleanup", async (req, res) => {
  try {
    const gymId = req.user!.gymId;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const deleted = await db.delete(membersTable)
      .where(and(eq(membersTable.gymId, gymId), lt(membersTable.expiryDate, sevenDaysAgo)))
      .returning({ id: membersTable.id });

    res.json({ deleted: deleted.length });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /members
router.get("/", async (req, res) => {
  try {
    const gymId = req.user!.gymId;
    const members = await db.select().from(membersTable).where(eq(membersTable.gymId, gymId));
    res.json({ members: members.map(serializeMember) });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /members
router.post("/", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().default(""),
    email: z.string().default(""),
    membershipType: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
    startDate: z.string(),
    expiryDate: z.string(),
    lastPaymentDate: z.string().nullable().optional(),
    isPaid: z.boolean().default(false),
    paymentAmount: z.number().min(0).default(0),
    notes: z.string().default(""),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed.", details: parsed.error.issues });
    return;
  }

  try {
    const data = parsed.data;
    const [member] = await db.insert(membersTable).values({
      gymId: req.user!.gymId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      membershipType: data.membershipType,
      startDate: new Date(data.startDate),
      expiryDate: new Date(data.expiryDate),
      lastPaymentDate: data.lastPaymentDate ? new Date(data.lastPaymentDate) : null,
      isPaid: data.isPaid,
      paymentAmount: String(data.paymentAmount),
      notes: data.notes,
    }).returning();

    res.status(201).json({ member: serializeMember(member) });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// GET /members/:memberId
router.get("/:memberId", async (req, res) => {
  try {
    const [member] = await db.select().from(membersTable)
      .where(and(eq(membersTable.id, req.params.memberId), eq(membersTable.gymId, req.user!.gymId)))
      .limit(1);

    if (!member) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.json({ member: serializeMember(member) });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// PATCH /members/:memberId
router.patch("/:memberId", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    membershipType: z.enum(["weekly", "monthly", "quarterly", "yearly"]).optional(),
    startDate: z.string().optional(),
    expiryDate: z.string().optional(),
    lastPaymentDate: z.string().nullable().optional(),
    isPaid: z.boolean().optional(),
    paymentAmount: z.number().min(0).optional(),
    notes: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed.", details: parsed.error.issues });
    return;
  }

  try {
    const data = parsed.data;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.membershipType !== undefined) updateData.membershipType = data.membershipType;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.expiryDate !== undefined) updateData.expiryDate = new Date(data.expiryDate);
    if (data.lastPaymentDate !== undefined) updateData.lastPaymentDate = data.lastPaymentDate ? new Date(data.lastPaymentDate) : null;
    if (data.isPaid !== undefined) updateData.isPaid = data.isPaid;
    if (data.paymentAmount !== undefined) updateData.paymentAmount = String(data.paymentAmount);
    if (data.notes !== undefined) updateData.notes = data.notes;

    const [updated] = await db.update(membersTable)
      .set(updateData)
      .where(and(eq(membersTable.id, req.params.memberId), eq(membersTable.gymId, req.user!.gymId)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.json({ member: serializeMember(updated) });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// DELETE /members/:memberId
router.delete("/:memberId", async (req, res) => {
  try {
    const deleted = await db.delete(membersTable)
      .where(and(eq(membersTable.id, req.params.memberId), eq(membersTable.gymId, req.user!.gymId)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Member not found." });
      return;
    }
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

// POST /members/:memberId/payment
router.post("/:memberId/payment", async (req, res) => {
  const schema = z.object({ amount: z.number().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Amount must be a positive number." });
    return;
  }

  try {
    const [existing] = await db.select().from(membersTable)
      .where(and(eq(membersTable.id, req.params.memberId), eq(membersTable.gymId, req.user!.gymId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Member not found." });
      return;
    }

    const now = new Date();
    const currentExpiry = new Date(existing.expiryDate);
    const newExpiry = computeNewExpiry(currentExpiry, existing.membershipType);
    const newStartDate = currentExpiry > now ? existing.startDate : now;

    const [updated] = await db.update(membersTable).set({
      isPaid: true,
      paymentAmount: String(parsed.data.amount),
      lastPaymentDate: now,
      expiryDate: newExpiry,
      startDate: newStartDate,
      updatedAt: now,
    }).where(eq(membersTable.id, existing.id)).returning();

    res.json({ member: serializeMember(updated) });
  } catch {
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
