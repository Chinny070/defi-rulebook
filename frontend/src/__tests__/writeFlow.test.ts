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

  it("reports UNDETERMINED when consensus did not decide and state does not confirm", async () => {
    const request = makeRequest({
      waitForReceipt: vi.fn(async () => ({ statusName: "UNDETERMINED" })),
      verify: vi.fn(async () => ({ ok: false })),
    });

    const outcome = await runWrite(request);

    expect(outcome.state).toBe("UNDETERMINED");
    expect(outcome.consensus).toBe("UNDETERMINED");
    // State is the authority, so we still re-read before concluding undetermined.
    expect(request.verify).toHaveBeenCalledOnce();
    expect(isSuccess(outcome.state)).toBe(false);
  });

  it("reports SUCCESS when the receipt looks undetermined but state confirms the change", async () => {
    // Regression for the live challenge: the SDK receipt read as UNDETERMINED
    // while the transaction had in fact finalized (ch_2 created). The contract
    // state, not the receipt label, decides.
    const request = makeRequest({
      waitForReceipt: vi.fn(async () => ({ statusName: "UNDETERMINED" })),
      verify: vi.fn(async () => ({ ok: true, value: "ch_2" })),
    });

    const outcome = await runWrite(request);

    expect(outcome.state).toBe("SUCCESS");
    expect(outcome.value).toBe("ch_2");
    expect(request.verify).toHaveBeenCalledOnce();
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

  it("never reports success for an unknown receipt shape when state does not confirm", async () => {
    const request = makeRequest({
      waitForReceipt: vi.fn(async () => ({})),
      verify: vi.fn(async () => ({ ok: false })),
    });
    const outcome = await runWrite(request);
    expect(outcome.state).toBe("UNDETERMINED");
    expect(isSuccess(outcome.state)).toBe(false);
  });

  it("classifies terminal states", () => {
    expect(isTerminal("SUCCESS")).toBe(true);
    expect(isTerminal("UNDETERMINED")).toBe(true);
    expect(isTerminal("PROCESSING")).toBe(false);
  });
});
