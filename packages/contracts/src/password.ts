import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt, which the auth service uses, only reads the first 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordProblem =
  | "too_short"
  | "too_long"
  | "weak_classes"
  | "common"
  | "contains_name"
  | "repetitive"
  | "sequence";

export interface PasswordCheck {
  ok: boolean;
  /** 0 (unusable) to 4 (strong), for a strength meter. */
  score: 0 | 1 | 2 | 3 | 4;
  problems: PasswordProblem[];
}

const COMMON = [
  "password", "passw0rd", "qwerty", "qwertyuiop", "asdfgh", "zxcvbn", "letmein", "welcome", "admin", "iloveyou",
  "monkey", "dragon", "football", "baseball", "abc123", "111111", "123123", "000000", "master", "login",
  "princess", "sunshine", "shadow", "superman", "michael", "trustno1", "freedom", "whatever", "starwars",
  "omioroom", "watchtogether", "йцукен", "пароль", "привет", "любовь", "qazwsx", "1q2w3e", "zaq12wsx",
];

const SEQUENCES = [
  "0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю",
];

function hasSequence(value: string, length = 4): boolean {
  const v = value.toLowerCase();
  for (const seq of SEQUENCES) {
    for (let i = 0; i + length <= seq.length; i++) {
      const chunk = seq.slice(i, i + length);
      if (v.includes(chunk) || v.includes([...chunk].reverse().join(""))) return true;
    }
  }
  return false;
}

function hasRepeat(value: string, length = 4): boolean {
  return new RegExp(`(.)\\1{${length - 1},}`, "u").test(value);
}

/**
 * Judges a password for registration. `context` holds things the password must not contain
 * (the chosen name, the e-mail address).
 */
export function checkPassword(password: string, context: { username?: string; email?: string } = {}): PasswordCheck {
  const problems: PasswordProblem[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push("too_short");
  if (password.length > PASSWORD_MAX_LENGTH) problems.push("too_long");

  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter((re) => re.test(password)).length;
  // A long passphrase may use fewer kinds of characters
  const neededClasses = password.length >= 16 ? 2 : 3;
  if (classes < neededClasses) problems.push("weak_classes");

  const lower = password.toLowerCase();
  if (COMMON.some((word) => lower === word || (word.length >= 6 && lower.includes(word)))) problems.push("common");

  const names = [context.username, context.email?.split("@")[0]]
    .map((n) => (n ?? "").trim().toLowerCase())
    .filter((n) => n.length >= 3);
  if (names.some((n) => lower.includes(n))) problems.push("contains_name");

  if (hasRepeat(password)) problems.push("repetitive");
  if (hasSequence(password)) problems.push("sequence");

  let score: PasswordCheck["score"] = 0;
  if (!problems.includes("too_short") && !problems.includes("too_long")) {
    score = 1;
    if (!problems.includes("weak_classes")) score = 2;
    if (problems.length === 0) score = 3;
    if (problems.length === 0 && password.length >= 14 && classes >= 3) score = 4;
  }
  return { ok: problems.length === 0, score, problems };
}

export function passwordsMatch(password: string, repeated: string): boolean {
  return password.length > 0 && password === repeated;
}

/** For payload validation: just the hard rules (the detailed advice comes from checkPassword). */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "Password must be at least 10 characters")
  .max(PASSWORD_MAX_LENGTH, "Password must be at most 72 characters")
  .superRefine((value, ctx) => {
    const check = checkPassword(value);
    if (!check.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Weak password: ${check.problems.join(", ")}` });
  });
