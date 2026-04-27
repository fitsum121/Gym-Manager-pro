import bcrypt from "bcryptjs";

const COST_FACTOR = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Aliases for PIN hashing — same algorithm, same cost factor
export const hashPin = hashPassword;
export const comparePin = comparePassword;
