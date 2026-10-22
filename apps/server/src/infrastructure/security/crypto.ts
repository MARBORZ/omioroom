import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } from "node:crypto";

export function generateId(): string {
  return randomUUID();
}

export function generateSessionToken(): string {
  return randomBytes(24).toString("hex");
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Unambiguous characters

export function generatePrivateCode(length = 8): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    code += CODE_CHARS[byte % CODE_CHARS.length];
  }
  return code;
}

export function generateGlobalRoomId(): string {
  // 6-digit numeric string: 100000 - 999999
  const num = randomInt(100000, 1000000);
  return num.toString();
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(secret: string, expectedHash: string): boolean {
  try {
    const actualHash = hashSecret(secret);
    const bufA = Buffer.from(actualHash, "hex");
    const bufB = Buffer.from(expectedHash, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
