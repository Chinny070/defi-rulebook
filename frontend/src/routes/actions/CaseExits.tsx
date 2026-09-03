import { useState } from "react";
import { WriteAction } from "../../components/WriteAction";
import { useWalletContext } from "../../walletContext";
import { getCase, getRule } from "../../lib/contract";
import { useRead } from "../../hooks/useRead";
import { countdown } from "../../lib/format";
import type { Case } from "../../lib/types";

/**
 * The two permissionless exits that release a rule's active-case lock.
 *
 * Without a path to these, a case whose binding went stale - or whose reporter
 * simply walked away - would leave its rule looking locked forever. Both are
 * open to anyone precisely so that never happens, so the UI has to offer them.
 */
export function CaseExits({
  record,
  onDone,
}: {
  record: Case;
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  const rule = useRead(() => getRule(record.rule_id), [record.rule_id]);
  // Read the clock once, not on every render: rendering must stay pure.
  const [now] = useState(() => Math.floor(Date.now() / 1000));

  const ACTIVE = [
    "EVIDENCE_OPEN",
    "EVIDENCE_FROZEN",
    "VERDICT_PROPOSED",
    "CHALLENGED",
    "RE_ADJUDICATED",
  ];
  if (!ACTIVE.includes(record.status)) return null;

  // Stale means the rule moved on from the state this case bound at open time.
  const stale =
    rule.data !== null &&
    (rule.data.current_version !== record.expected_version ||
      rule.data.current_fingerprint !== record.expected_fingerprint);

  const expired =
    record.status === "EVIDENCE_OPEN" &&
    record.evidence_deadline > 0 &&
    now > record.evidence_deadline;

  if (!stale && !expired) {
    if (record.status !== "EVIDENCE_OPEN") return null;
    return (
      <p className="muted small">
        Evidence window: {countdown(record.evidence_deadline)}. Once it closes, anyone
        may abandon the case to release the rule.
      </p>
    );
  }

  return (
    <>
      {stale && (
        <WriteAction
          label="Invalidate stale case"
          walletAddress={wallet.address}
          onConfirmed={onDone}
          build={() => ({
            functionName: "invalidate_stale_case",
            args: [record.case_id],
            verify: async () => {
              const fresh = await getCase(record.case_id);
              return {
                ok: fresh.status === "INVALIDATED",
                detail: `The case is still ${fresh.status}.`,
              };
            },
          })}
        >
          <p className="muted small">
            The canonical rule changed after this case was opened, so it can no longer
            act on the state it examined. Anyone may close it; the bond is refunded in
            full because this is a structural outcome, not the reporter&rsquo;s fault.
          </p>
        </WriteAction>
      )}

      {expired && (
        <WriteAction
          label="Abandon expired case"
          walletAddress={wallet.address}
          onConfirmed={onDone}
          build={() => ({
            functionName: "abandon_expired_case",
            args: [record.case_id],
            verify: async () => {
              const fresh = await getCase(record.case_id);
              return {
                ok: fresh.status === "ABANDONED",
                detail: `The case is still ${fresh.status}.`,
              };
            },
          })}
        >
          <p className="muted small">
            The evidence window closed without the case being frozen. Anyone may abandon
            it to release the rule for a new case. The bond is refunded in full.
          </p>
        </WriteAction>
      )}
    </>
  );
}
