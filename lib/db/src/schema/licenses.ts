import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const licensesTable = pgTable("licenses", {
  id: serial("id").primaryKey(),
  gymId: text("gym_id").notNull(),
  code: text("code").notNull().unique(),
  expiryDate: timestamp("expiry_date", { withTimezone: true }).notNull(),
  // Set when the gym owner activates the code in the mobile app.
  // Null means the code was generated but not yet activated.
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLicenseSchema = createInsertSchema(licensesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type License = typeof licensesTable.$inferSelect;
