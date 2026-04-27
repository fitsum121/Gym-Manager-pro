import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminsTable = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminSchema = createInsertSchema(adminsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectAdminSchema = createSelectSchema(adminsTable);

export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof adminsTable.$inferSelect;
