import { describe, expect, it, vi } from "vitest";
import { isSuccess, isTerminal, runWrite, type WriteState } from "../lib/writeFlow";

function makeRequest(overrides: Partial<Parameters<typeof runWrite>[0]> = {}) {
  return {
    submit: vi.fn(async () => "0xhash"),
    waitForReceipt: vi.fn(async () => ({ statusName: "ACCEPTED" })),
    verify: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

describe("write flow", () => {
  it("reports SUCCESS only after re-reading state confirms the change", async () => {
    const states: WriteState[] = [];
    const request = makeRequest({ onProgress: (p) => states.push(p.state) });

    const outcome = await runWrite(request);

    expect(outcome.state).toBe("SUCCESS");
    expect(request.verify).toHaveBeenCalledOnce();
    expect(states).toEqual([
      "AWAITING_SIGNATURE",
      "SUBMITTED",
      "PROCESSING",
      "CONSENSUS_CHECK",
      "STATE_REVALIDATING",
      "SUCCESS",
    ]);
  });

  it("reports UNDETERMINED and never verifies when consensus did not decide", async () => {
    const request = makeRequest({
      waitForReceipt: vi.fn(async () => ({ statusName: "UNDETERMINED" })),
    });

    const outcome = await runWrite(request);

    expect(outcome.state).toBe("UNDETERMINED");
    expect(outcome.consensus).toBe("UNDETERMINED");
    expect(request.verify).not.toHaveBeenCalled();
    expect(isSuccess(outcome.state)).toBe(false);
  });

  it("treats a canceled transaction as FAILED", async () => {
    const request = makeRequest({
      waitForReceipt: vi.fn(async () => ({ statusName: "CANCELED" })),
    });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("FAILED");
    expect(request.verify).not.toHaveBeenCalled();
  });

  it("reports STATE_MISMATCH when consensus committed but state disagrees", async () => {
    const request = makeRequest({
      verify: vi.fn(async () => ({ ok: false, detail: "rule still at v0" })),
    });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("STATE_MISMATCH");
    expect(outcome.message).toContain("rule still at v0");
    expect(isSuccess(outcome.state)).toBe(false);
  });

  it("reports STATE_MISMATCH when the verification read itself fails", async () => {
    const request = makeRequest({
      verify: vi.fn(async () => {
        throw new Error("read failed");
      }),
    });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("STATE_MISMATCH");
    expect(outcome.error).toContain("read failed");
  });

  it("treats a receipt timeout as UNDETERMINED, not failure", async () => {
    const request = makeRequest({
      waitForReceipt: vi.fn(async () => {
        throw new Error("timeout waiting for receipt");
      }),
    });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("UNDETERMINED");
    expect(request.verify).not.toHaveBeenCalled();
  });

  it("reports FAILED when the wallet rejects the signature", async () => {
    const request = makeRequest({
      submit: vi.fn(async () => {
        throw new Error("user rejected");
      }),
    });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("FAILED");
    expect(outcome.hash).toBeUndefined();
  });

  it("never reports success for an unknown receipt shape", async () => {
    const request = makeRequest({ waitForReceipt: vi.fn(async () => ({}) ) });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("UNDETERMINED");
  });

  it("classifies terminal states", () => {
    expect(isTerminal("SUCCESS")).toBe(true);
    expect(isTerminal("UNDETERMINED")).toBe(true);
    expect(isTerminal("PROCESSING")).toBe(false);
  });
});
