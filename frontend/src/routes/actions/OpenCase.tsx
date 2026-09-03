import { useState } from "react";
import { WriteAction } from "../../components/WriteAction";
import { useWalletContext } from "../../walletContext";
import { getRule, listRuleCases } from "../../lib/contract";
import type { Rule } from "../../lib/types";

/**
 * RULE_CLAIM establishes a first commitment; RULE_DRIFT supersedes an existing
 * one. Which is offered is decided by the rule, not by the user, so the two
 * can never be confused.
 */
export function OpenCase({ rule, onDone }: { rule: Rule; onDone?: () => void }) {
  const wallet = useWalletContext();
  const [text, setText] = useState("");
  const [scope, setScope] = useState("");
  const [exceptions, setExceptions] = useState("");

  const isDrift = rule.has_canonical_version;
  const locked = rule.active_case_id !== "";
  const valid = text.trim().length >= 8 && text.trim().length <= 600;

  if (locked) {
    return (
      <p className="muted">
        A case is already open on this rule. Only one case at a time may change a
        canonical commitment.
      </p>
    );
  }

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <p className="muted small">
        {isDrift
          ? `This binds to v${rule.current_version} and its fingerprint. If the rule advances before finalization, the case fails closed rather than overwriting the newer version.`
          : "A first claim asserts what authoritative evidence establishes - not what the rule should be."}
      </p>
      <label>
        {isDrift ? "Replacement commitment" : "Claimed commitment"}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Emergency withdrawals may be paused for at most 72 hours."
        />
        <span className="hint">8-600 characters. State the operative rule, not an argument for it.</span>
      </label>
      <label>
        Scope (optional)
        <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="ethereum mainnet" />
      </label>
      <label>
        Exceptions (optional)
        <input
          value={exceptions}
          onChange={(e) => setExceptions(e.target.value)}
          placeholder="Does not apply to isolated markets."
        />
      </label>

      <WriteAction
        label={isDrift ? "Open drift case" : "Open rule claim"}
        walletAddress={wallet.address}
        disabled={!valid}
        onConfirmed={onDone}
        build={() => ({
          functionName: isDrift ? "open_rule_drift" : "open_rule_claim",
          args: isDrift
            ? [
                rule.rule_id,
                rule.current_version,
                rule.current_fingerprint,
                text.trim(),
                scope.trim(),
                exceptions.trim(),
              ]
            : [rule.rule_id, text.trim(), scope.trim(), exceptions.trim()],
          verify: async () => {
            const fresh = await getRule(rule.rule_id);
            if (fresh.active_case_id === "") {
              return { ok: false, detail: "No case is locked to the rule." };
            }
            const cases = await listRuleCases(rule.rule_id, 0, 50);
            const opened = cases.some((c) => c.case_id === fresh.active_case_id);
            return { ok: opened, detail: "The case does not appear on the rule." };
          },
        })}
      />
    </form>
  );
}
