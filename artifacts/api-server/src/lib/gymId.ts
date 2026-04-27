const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateGymId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return id;
}
