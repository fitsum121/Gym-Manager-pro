import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enable SSL for any hosted database (Neon, Aiven, Supabase, etc.)
// Local databases (localhost / 127.0.0.1) don't need SSL
const isLocalDb =
  process.env.DATABASE_URL?.includes("localhost") ||
  process.env.DATABASE_URL?.includes("127.0.0.1");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export * from "./schema";
