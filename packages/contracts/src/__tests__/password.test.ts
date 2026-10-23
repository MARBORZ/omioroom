import { describe, it, expect } from "vitest";
import { checkPassword, passwordsMatch, passwordSchema } from "../password.js";

describe("password check", () => {
  it("accepts a good password", () => {
    const r = checkPassword("Tiger-Lamp-92-cloud");
    expect(r.ok).toBe(true);
    expect(r.score).toBe(4);
  });

  it("accepts a long passphrase without digits or symbols", () => {
    expect(checkPassword("синий чайник кипит громко").ok).toBe(true);
  });

  it("rejects short, common, repetitive and sequential passwords", () => {
    expect(checkPassword("Ab1!").problems).toContain("too_short");
    expect(checkPassword("Password123!").problems).toContain("common");
    expect(checkPassword("qwertyuiop1A").problems).toContain("common");
    expect(checkPassword("Aaaa1111Bbbb").problems).toContain("repetitive");
    expect(checkPassword("Xk93abcd!Zw").problems).toContain("sequence");
    expect(checkPassword("alllowercaseletters").ok).toBe(false);
  });

  it("rejects a password that contains the name or the e-mail address", () => {
    expect(checkPassword("Mar-Borz-2026!x", { username: "Borz" }).problems).toContain("contains_name");
    expect(checkPassword("amadi.Masuev#77", { email: "amadi.masuev@gmail.com" }).problems).toContain("contains_name");
  });

  it("rejects passwords longer than the auth service reads", () => {
    expect(checkPassword("Ab1!" + "x9Z".repeat(30)).problems).toContain("too_long");
  });

  it("compares the repeated password exactly", () => {
    expect(passwordsMatch("Tiger-Lamp-92", "Tiger-Lamp-92")).toBe(true);
    expect(passwordsMatch("Tiger-Lamp-92", "tiger-lamp-92")).toBe(false);
    expect(passwordsMatch("", "")).toBe(false);
  });

  it("the payload schema enforces the same rules", () => {
    expect(passwordSchema.safeParse("Tiger-Lamp-92-cloud").success).toBe(true);
    expect(passwordSchema.safeParse("123456").success).toBe(false);
  });
});
