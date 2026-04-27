import { boolean, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ownersTable } from "./owners";

export const membersTable = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: text("gym_id")
    .notNull()
    .references(() => ownersTable.gymId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  membershipType: text("membership_type").notNull().$type<"weekly" | "monthly" | "quarterly" | "yearly">(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  expiryDate: timestamp("expiry_date", { withTimezone: true }).notNull(),
  lastPaymentDate: timestamp("last_payment_date", { withTimezone: true }),
  isPaid: boolean("is_paid").notNull().default(false),
  paymentAmount: numeric("payment_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectMemberSchema = createSelectSchema(membersTable);

export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
