import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ownersTable } from "./owners";

export const staffTable = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: text("gym_id")
    .notNull()
    .references(() => ownersTable.gymId, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Login credential — unique within a gym, set by the owner.
  // Stored lowercase; login comparison is case-insensitive.
  username: text("username").notNull().default(""),
  pinHash: text("pin_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Enforce uniqueness of username within a gym at the DB level.
  uniqueIndex("staff_gym_username_idx").on(t.gymId, t.username),
]);

export const insertStaffSchema = createInsertSchema(staffTable).omit({
  id: true,
  createdAt: true,
});

export const selectStaffSchema = createSelectSchema(staffTable);

export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type Staff = typeof staffTable.$inferSelect;
