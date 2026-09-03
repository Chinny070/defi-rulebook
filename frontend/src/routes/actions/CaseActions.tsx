import { useState } from "react";
import { WriteAction } from "../../components/WriteAction";
import { useWalletContext } from "../../walletContext";
import {
  getBondState,
  getCase,
  getCaseSnapshotStatus,
  getEvidenceSnapshot,
  getRule,
  listCaseChallenges,
  listCaseEvidence,
  listCaseVerdicts,
} from "../../lib/contract";
import { gen } from "../../lib/format";
import type { Case, Evidence } from "../../lib/types";

/** Post the fixed proposer bond. The amount is not caller-selectable. */
export function LockBond({
  caseId,
  requiredAmount,
  onDone,
}: {
  caseId: string;
  requiredAmount: string;
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label={`Lock bond (${gen(requiredAmount)})`}
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "lock_bond",
        args: [caseId],
        value: BigInt(requiredAmount),
        verify: async () => {
          const bond = await getBondState(caseId);
          return {
            ok: bond.has_bond && bond.state === "LOCKED",
            detail: "The bond does not show as locked on-chain.",
            value: bond,
          };
        },
      })}
    >
      <p className="muted small">
        The bond is fixed by contract configuration - you cannot choose the amount, and a
        bond never influences adjudication.
      </p>
    </WriteAction>
  );
}

export function SubmitEvidence({
  caseId,
  vocab,
  onDone,
}: {
  caseId: string;
  vocab: { evidence_types: string[]; retrieval_modes: string[] } | null;
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState("RENDER_TEXT");
  const [anchors, setAnchors] = useState("");
  const [claimedType, setClaimedType] = useState("OFFICIAL_DOCUMENTATION");
  const [note, setNote] = useState("");
  const [publishedKnown, setPublishedKnown] = useState(false);
  const [published, setPublished] = useState("");

  const anchorList = anchors
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const valid =
    /^https?:\/\/.+\..+/.test(url.trim()) &&
    anchorList.length >= 1 &&
    anchorList.length <= 3 &&
    note.trim().length >= 4;

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <label>
        Source URL
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.example.com/faq" />
      </label>
      <label>
        Retrieval method
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {(vocab?.retrieval_modes ?? ["GET", "RENDER_TEXT", "RENDER_TEXT_WAIT"]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="hint">
          GET for static pages, RENDER_TEXT when the page needs a browser.
        </span>
      </label>
      <label>
        Anchors (1-3, comma separated)
        <input value={anchors} onChange={(e) => setAnchors(e.target.value)} placeholder="emergency pause, 72 hours" />
        <span className="hint">
          The excerpt is extracted around the first anchor found, so it is reproducible.
        </span>
      </label>
      <label>
        Claimed source type
        <select value={claimedType} onChange={(e) => setClaimedType(e.target.value)}>
          {(vocab?.evidence_types ?? ["OFFICIAL_DOCUMENTATION"]).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="hint">An unverified assertion. Adjudication checks it.</span>
      </label>
      <label>
        Relevance note
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="States the maximum pause duration." />
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={publishedKnown}
          onChange={(e) => setPublishedKnown(e.target.checked)}
        />
        I know the publication time
      </label>
      {publishedKnown && (
        <label>
          Published at (unix seconds)
          <input value={published} onChange={(e) => setPublished(e.target.value)} placeholder="1740000000" />
        </label>
      )}

      <WriteAction
        label="Submit evidence"
        walletAddress={wallet.address}
        disabled={!valid}
        onConfirmed={onDone}
        build={() => ({
          functionName: "submit_evidence",
          args: [
            caseId,
            url.trim(),
            mode,
            anchorList,
            claimedType,
            note.trim(),
            publishedKnown ? Number(published || 0) : 0,
            publishedKnown,
          ],
          verify: async () => {
            const rows: Evidence[] = await listCaseEvidence(caseId, 0, 50);
            const found = rows.some((r) => r.url === url.trim());
            return {
              ok: found,
              detail: "The evidence does not appear on the case.",
            };
          },
        })}
      />
    </form>
  );
}

export function FreezeEvidence({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label="Freeze evidence"
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "freeze_evidence",
        args: [caseId],
        verify: async () => {
          const record: Case = await getCase(caseId);
          return {
            ok: record.status === "EVIDENCE_FROZEN",
            detail: `The case is still ${record.status}.`,
          };
        },
      })}
    >
      <p className="muted small">
        Freezing is irreversible. After it, no evidence can be added or removed and the
        claim text cannot change. Only the reporter can freeze.
      </p>
    </WriteAction>
  );
}

export function SnapshotEvidence({
  evidenceId,
  onDone,
}: {
  evidenceId: string;
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label="Retrieve snapshot"
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "snapshot_evidence",
        args: [evidenceId],
        verify: async () => {
          const snap = await getEvidenceSnapshot(evidenceId);
          // A recorded failure is a real, committed outcome - not a mismatch.
          const settled =
            snap.retrieval_status === "SNAPSHOT_COMPLETE" ||
            snap.retrieval_status === "SNAPSHOT_FAILED";
          return {
            ok: settled,
            detail: "The snapshot did not reach a terminal state.",
            value: snap,
          };
        },
      })}
    />
  );
}

export function RequestAdjudication({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label="Request adjudication"
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "request_adjudication",
        args: [caseId],
        verify: async () => {
          const verdicts = await listCaseVerdicts(caseId, 0, 10);
          const record = await getCase(caseId);
          return {
            ok: verdicts.length > 0 && record.status === "VERDICT_PROPOSED",
            detail: "No verdict was recorded on the case.",
          };
        },
      })}
    >
      <p className="muted small">
        Validators reason over the frozen excerpts only. This is the step most likely to
        return Undetermined; if it does, nothing is lost and it can be retried.
      </p>
    </WriteAction>
  );
}

export function OpenChallenge({
  caseId,
  grounds,
  onDone,
}: {
  caseId: string;
  grounds: string[];
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  const [ground, setGround] = useState(grounds[0] ?? "CLAIM_SUPPORT_ERROR");
  const [argument, setArgument] = useState("");
  const valid = argument.trim().length >= 16 && argument.trim().length <= 600;

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <label>
        Ground
        <select value={ground} onChange={(e) => setGround(e.target.value)}>
          {grounds.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <span className="hint">
          A challenge must name one specific defect. Disagreement is not a ground.
        </span>
      </label>
      <label>
        Explanation
        <textarea
          value={argument}
          onChange={(e) => setArgument(e.target.value)}
          rows={4}
          placeholder="The cited page never states a maximum duration; the 72 hour figure comes from an unrelated section."
        />
        <span className="hint">16-600 characters.</span>
      </label>
      <WriteAction
        label="Open challenge"
        walletAddress={wallet.address}
        disabled={!valid}
        onConfirmed={onDone}
        build={() => ({
          functionName: "open_challenge",
          args: [caseId, ground, argument.trim(), []],
          verify: async () => {
            const record = await getCase(caseId);
            const challenges = await listCaseChallenges(caseId, 0, 10);
            return {
              ok: record.status === "CHALLENGED" && challenges.some((ch) => ch.status === "OPEN"),
              detail: "No open challenge appears on the case.",
            };
          },
        })}
      />
    </form>
  );
}

export function ResolveChallenge({
  challengeId,
  caseId,
  onDone,
}: {
  challengeId: string;
  caseId: string;
  onDone?: () => void;
}) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label="Resolve challenge"
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "resolve_challenge",
        args: [challengeId],
        verify: async () => {
          const record = await getCase(caseId);
          return {
            ok: record.status === "RE_ADJUDICATED" && record.open_challenge_id === "",
            detail: "The challenge is still open on-chain.",
          };
        },
      })}
    >
      <p className="muted small">
        Re-adjudicates over the same frozen evidence. The previous verdict is kept; a new
        one is appended.
      </p>
    </WriteAction>
  );
}

export function FinalizeCase({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label="Finalize case"
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "finalize_case",
        args: [caseId],
        verify: async () => {
          const record = await getCase(caseId);
          const terminal = record.status === "FINALIZED" || record.status === "REJECTED";
          if (!terminal) {
            return { ok: false, detail: `The case is still ${record.status}.` };
          }
          if (record.status === "FINALIZED") {
            const rule = await getRule(record.rule_id);
            return {
              ok: rule.has_canonical_version,
              detail: "The case finalized but no canonical version was minted.",
            };
          }
          return { ok: true };
        },
      })}
    />
  );
}

export function ExecutePayout({ caseId, onDone }: { caseId: string; onDone?: () => void }) {
  const wallet = useWalletContext();
  return (
    <WriteAction
      label="Execute payout"
      walletAddress={wallet.address}
      onConfirmed={onDone}
      build={() => ({
        functionName: "execute_payout",
        args: [caseId],
        verify: async () => {
          const bond = await getBondState(caseId);
          return {
            ok: bond.state === "SETTLED",
            detail: "The bond does not show as settled.",
            value: bond,
          };
        },
      })}
    >
      <p className="muted small">
        Recipients were frozen when the case closed. Anyone may trigger the payout;
        nobody can redirect it.
      </p>
    </WriteAction>
  );
}

/** Small helper used by the case page to decide which actions to offer. */
export async function snapshotProgress(caseId: string) {
  return getCaseSnapshotStatus(caseId);
}
