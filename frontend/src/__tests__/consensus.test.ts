import { describe, expect, it } from "vitest";
import { classifyReceipt, explainVerdict, isCommitted, TX_STATUS } from "../lib/consensus";

describe("consensus classification", () => {
  it("treats ACCEPTED and FINALIZED as committed", () => {
    expect(classifyReceipt({ statusName: TX_STATUS.ACCEPTED })).toBe("COMMITTED");
    expect(classifyReceipt({ statusName: TX_STATUS.FINALIZED })).toBe("COMMITTED");
  });

  it("treats every undecided consensus outcome as UNDETERMINED", () => {
    for (const status of [
      TX_STATUS.UNDETERMINED,
      TX_STATUS.VALIDATORS_TIMEOUT,
      TX_STATUS.LEADER_TIMEOUT,
    ]) {
      expect(classifyReceipt({ statusName: status })).toBe("UNDETERMINED");
    }
  });

  it("treats CANCELED as failed", () => {
    expect(classifyReceipt({ statusName: TX_STATUS.CANCELED })).toBe("FAILED");
  });

  it("treats in-flight statuses as pending, never as success", () => {
    for (const status of [
      TX_STATUS.PENDING,
      TX_STATUS.PROPOSING,
      TX_STATUS.COMMITTING,
      TX_STATUS.REVEALING,
      TX_STATUS.READY_TO_FINALIZE,
    ]) {
      expect(classifyReceipt({ statusName: status })).toBe("PENDING");
    }
  });

  it("never treats a missing or unknown status as committed", () => {
    expect(classifyReceipt(null)).toBe("UNDETERMINED");
    expect(classifyReceipt(undefined)).toBe("UNDETERMINED");
    expect(classifyReceipt({})).toBe("UNDETERMINED");
    expect(classifyReceipt({ statusName: "SOMETHING_NEW" })).toBe("UNDETERMINED");
    expect(classifyReceipt({ status: 999 })).toBe("UNDETERMINED");
  });

  it("resolves numeric status codes the SDK reports (regression: false UNDETERMINED)", () => {
    // genlayer-js reports status as a number; 5=ACCEPTED, 7=FINALIZED,
    // 6=UNDETERMINED, 8=CANCELED. A committed tx arriving as a number must
    // not be misread as undetermined.
    expect(classifyReceipt({ status: 5 })).toBe("COMMITTED");
    expect(classifyReceipt({ status: 7 })).toBe("COMMITTED");
    expect(classifyReceipt({ status: 6 })).toBe("UNDETERMINED");
    expect(classifyReceipt({ status: 8 })).toBe("FAILED");
  });

  it("falls back to the status field whether it is a name or a numeric string", () => {
    expect(classifyReceipt({ status: "ACCEPTED" })).toBe("COMMITTED");
    expect(classifyReceipt({ status: "5" })).toBe("COMMITTED");
    expect(classifyReceipt({ status: "7" })).toBe("COMMITTED");
  });

  it("is case insensitive", () => {
    expect(classifyReceipt({ statusName: "finalized" })).toBe("COMMITTED");
    expect(isCommitted("accepted")).toBe(true);
  });

  it("explains an undetermined outcome without implying failure or success", () => {
    const text = explainVerdict("UNDETERMINED", "UNDETERMINED").toLowerCase();
    expect(text).toContain("not");
    expect(text).toContain("retry");
  });
});
