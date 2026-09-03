import { describe, expect, it } from "vitest";
import { countdown, gen, humanCategory, shortHash, timestamp } from "../lib/format";

describe("formatting", () => {
  it("renders 18-decimal amounts without floating point drift", () => {
    expect(gen("1000000000000000000")).toBe("1 GEN");
    expect(gen("500000000000000000")).toBe("0.5 GEN");
    expect(gen("250000000000000000")).toBe("0.25 GEN");
    expect(gen("0")).toBe("0 GEN");
    expect(gen(undefined)).toBe("-");
  });

  it("shortens hashes but keeps the full value available", () => {
    const hash = "0x" + "a".repeat(64);
    expect(shortHash(hash)).toContain("...");
    expect(shortHash("0xabc")).toBe("0xabc");
    expect(shortHash(undefined)).toBe("-");
  });

  it("formats timestamps as UTC", () => {
    expect(timestamp(0)).toBe("-");
    expect(timestamp(1700000000)).toMatch(/UTC$/);
  });

  it("reports a closed challenge window", () => {
    expect(countdown(1)).toBe("closed");
    expect(countdown(undefined)).toBe("-");
  });

  it("humanizes category names", () => {
    expect(humanCategory("EMERGENCY_CONTROLS")).toBe("Emergency Controls");
  });
});
