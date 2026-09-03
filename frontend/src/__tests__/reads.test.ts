import { describe, expect, it, vi } from "vitest";

const readContract = vi.fn();

vi.mock("../lib/client", () => ({
  getReadClient: () => ({ readContract }),
  requireAddress: () => "0x" + "1".repeat(40),
  ContractNotConfiguredError: class extends Error {},
}));

const contract = await import("../lib/contract");

describe("read layer", () => {
  // Each test sets its own implementation. A beforeEach mockReset() makes
  // Vitest 4 re-surface a mock's recorded error as a test failure even when
  // the code under test handled it, so the reset is deliberately absent.

  it("clamps page sizes before they leave the browser", () => {
    expect(contract.boundedLimit(100000)).toBe(50);
    expect(contract.boundedLimit(0)).toBe(20);
    expect(contract.boundedLimit(-5)).toBe(20);
    expect(contract.boundedLimit(10)).toBe(10);
  });

  it("never sends an unbounded limit to a list view", async () => {
    readContract.mockImplementation(() => Promise.resolve([]));
    await contract.listProtocols(0, 100000);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "list_protocols", args: [0, 50] }),
    );
  });

  it("returns an empty list for a protocol with no canonical rules", async () => {
    readContract.mockImplementation(() => Promise.resolve([]));
    await expect(contract.getCurrentRules("proto-a")).resolves.toEqual([]);
  });

  async function codeOf(run: () => Promise<unknown>): Promise<string> {
    try {
      await run();
    } catch (error) {
      return (error as { code: string }).code;
    }
    throw new Error("expected the read to reject");
  }

  it("surfaces the contract error code for a missing rule", async () => {
    readContract.mockImplementation(async () => {
      throw new Error("UserError: [RULE_NOT_FOUND] r_99");
    });
    expect(await codeOf(() => contract.getRule("r_99"))).toBe("RULE_NOT_FOUND");
  });

  it("surfaces the contract error code for a missing case", async () => {
    readContract.mockImplementation(async () => {
      throw new Error("[CASE_NOT_FOUND] c_99");
    });
    expect(await codeOf(() => contract.getCase("c_99"))).toBe("CASE_NOT_FOUND");
  });

  it("falls back to a generic code when none is present", async () => {
    readContract.mockImplementation(async () => {
      throw new Error("network down");
    });
    expect(await codeOf(() => contract.getConfig())).toBe("READ_FAILED");
  });

  it("passes pagination through for every list view", async () => {
    readContract.mockImplementation(() => Promise.resolve([]));
    await contract.listCaseEvidence("c_1", 20, 10);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "list_case_evidence", args: ["c_1", 20, 10] }),
    );
  });
});
