// NEW SECRET - Updated for security. Must match the LICENSE_SECRET in api-server/.env
export const LICENSE_SECRET = "FkIaw6E9bE97aisseLrt/kV23NiQ6tBBfZRqAMCuW2jTWfEbHE8BIewSjfHBxRB9";

export const ADMIN_TELEGRAM = "@Fitgrr";
export const ADMIN_PHONE = "+251977978447";

export function generateGymId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export function sign(secret: string, payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc59d1c81;
  const s = secret + "|" + payload + "|" + secret;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = ((Math.imul(h2 + c, 0x85ebca77) ^ (h2 << 5)) >>> 0);
  }
  return (
    h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
  ).toUpperCase();
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

export function dateToYYMMDD(d: Date): string {
  const yy = (d.getFullYear() % 100).toString().padStart(2, "0");
  return yy + pad2(d.getMonth() + 1) + pad2(d.getDate());
}

export function yymmddToDate(s: string): Date | null {
  if (!/^\d{6}$/.test(s)) return null;
  const yy = parseInt(s.slice(0, 2), 10);
  const mm = parseInt(s.slice(2, 4), 10);
  const dd = parseInt(s.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return new Date(2000 + yy, mm - 1, dd, 23, 59, 59);
}

export function makeActivationCode(gymId: string, expiryDate: Date, secret: string = LICENSE_SECRET): string {
  const id = gymId.toUpperCase().trim();
  const exp = dateToYYMMDD(expiryDate);
  const sig = sign(secret, `${id}|${exp}`).slice(0, 8);
  return `GYM-${id}-${exp}-${sig}`;
}

export type ParsedCode = {
  valid: boolean;
  gymId?: string;
  expiryDate?: Date;
  reason?: string;
};

export function parseAndVerifyCode(code: string, expectedGymId: string, secret: string = LICENSE_SECRET): ParsedCode {
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
  const parts = cleaned.split("-");
  if (parts.length !== 4 || parts[0] !== "GYM") {
    return { valid: false, reason: "Invalid code format." };
  }
  const [, gymId, expRaw, sig] = parts;
  if (gymId !== expectedGymId.toUpperCase()) {
    return { valid: false, reason: "This code is not for your gym." };
  }
  const expiryDate = yymmddToDate(expRaw);
  if (!expiryDate) {
    return { valid: false, reason: "Invalid expiry date in code." };
  }
  const expectedSig = sign(secret, `${gymId}|${expRaw}`).slice(0, 8);
  if (sig !== expectedSig) {
    return { valid: false, reason: "Invalid code signature." };
  }
  return { valid: true, gymId, expiryDate };
}
