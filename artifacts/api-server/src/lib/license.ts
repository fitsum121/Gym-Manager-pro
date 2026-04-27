if (!process.env.LICENSE_SECRET) {
  throw new Error("LICENSE_SECRET environment variable is required but was not provided.");
}
export const LICENSE_SECRET = process.env.LICENSE_SECRET;

export function sign(secret: string, payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc59d1c81;
  const s = secret + "|" + payload + "|" + secret;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 + c, 0x85ebca77) ^ (h2 << 5)) >>> 0;
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

export function makeActivationCode(gymId: string, expiryDate: Date): string {
  const id = gymId.toUpperCase().trim();
  const exp = dateToYYMMDD(expiryDate);
  const sig = sign(LICENSE_SECRET, `${id}|${exp}`).slice(0, 8);
  return `GYM-${id}-${exp}-${sig}`;
}
