import { describe, expect, it } from "vitest";
import { describeWalletError } from "../lib/errors";

describe("describeWalletError", () => {
  it("maps user rejection (code 4001) to a clear, non-alarming message", () => {
    const msg = describeWalletError({ code: 4001, message: "User rejected the request" });
    expect(msg).toMatch(/rejected/i);
    expect(msg).toMatch(/nothing was sent/i);
  });

  it("maps a pending request (code -32002) to an actionable message", () => {
    const msg = describeWalletError({ code: -32002 });
    expect(msg).toMatch(/already pending/i);
  });

  it("guides the user to add StudioNet on an unknown chain (code 4902)", () => {
    const msg = describeWalletError({ code: 4902 });
    expect(msg).toMatch(/StudioNet/);
    expect(msg).toMatch(/Switch to StudioNet/i);
  });

  it("recognizes insufficient funds from the message text", () => {
    const msg = describeWalletError({ message: "insufficient funds for gas" });
    expect(msg).toMatch(/enough GEN|balance is too low/i);
  });

  it("detects a user denial phrased without an error code", () => {
    const msg = describeWalletError(new Error("MetaMask Tx Signature: User denied transaction"));
    expect(msg).toMatch(/rejected/i);
  });

  it("falls back to the wallet's own message when unrecognized", () => {
    const msg = describeWalletError({ message: "some novel provider fault" });
    expect(msg).toMatch(/some novel provider fault/);
  });

  it("never returns an empty string", () => {
    expect(describeWalletError(undefined)).not.toBe("");
    expect(describeWalletError(null)).not.toBe("");
    expect(describeWalletError({})).not.toBe("");
  });
});
