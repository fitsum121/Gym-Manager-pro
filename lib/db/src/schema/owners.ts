import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ownersTable = pgTable("owners", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: text("gym_id").notNull().unique(),
  name: text("name").notNull(),
  gymName: text("gym_name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOwnerSchema = createInsertSchema(ownersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectOwnerSchema = createSelectSchema(ownersTable);

export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type Owner = typeof ownersTable.$inferSelect;
