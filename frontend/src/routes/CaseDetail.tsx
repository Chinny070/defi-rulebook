import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import {
  getBondState,
  getCase,
  getCaseFrozenEvidence,
  getCaseSnapshotStatus,
  getChallengeWindow,
  getVocabularies,
  listCaseChallenges,
  listCaseEvidence,
  listCaseVerdicts,
} from "../lib/contract";
import { countdown, gen, relative, timestamp } from "../lib/format";
import {
  Field,
  Hash,
  Panel,
  ReadView,
  StatusBadge,
} from "../components/ui";
import {
  ExecutePayout,
  FinalizeCase,
  FreezeEvidence,
  LockBond,
  OpenChallenge,
  RequestAdjudication,
  SnapshotEvidence,
  SubmitEvidence,
} from "./actions/CaseActions";
import { CaseExits } from "./actions/CaseExits";

export default function CaseDetail() {
  const { id = "" } = useParams();
  const record = useRead(() => getCase(id), [id]);
  const evidence = useRead(() => listCaseEvidence(id, 0, 20), [id]);
  const frozen = useRead(() => getCaseFrozenEvidence(id), [id]);
  const snapshots = useRead(() => getCaseSnapshotStatus(id), [id]);
  const verdicts = useRead(() => listCaseVerdicts(id, 0, 10), [id]);
  const challenges = useRead(() => listCaseChallenges(id, 0, 10), [id]);
  const window = useRead(() => getChallengeWindow(id), [id]);
  const bond = useRead(() => getBondState(id), [id]);
  const vocab = useRead(() => getVocabularies(), []);

  const reloadAll = () => {
    record.reload();
    evidence.reload();
    frozen.reload();
    snapshots.reload();
    verdicts.reload();
    challenges.reload();
    window.reload();
    bond.reload();
  };

  return (
    <div className="page">
      <ReadView state={record} what="case">
        {(c) => (
          <>
            <header className="page-head">
              <div>
                <p className="crumb">
                  <Link to={`/protocol/${c.protocol_id}`}>{c.protocol_id}</Link>
                  {" / "}
                  <Link to={`/rule/${c.rule_id}`}>{c.rule_id}</Link>
                </p>
                <h1>
                  {c.case_type === "RULE_DRIFT" ? "Drift case" : "Rule claim"} {c.case_id}
                </h1>
              </div>
              <StatusBadge status={c.status} />
            </header>

            <Panel title="Claim under adjudication">
              <blockquote className="canonical">{c.claimed_text}</blockquote>
              <dl className="fields">
                {c.claimed_scope && <Field label="Scope">{c.claimed_scope}</Field>}
                {c.claimed_exceptions && (
                  <Field label="Exceptions">{c.claimed_exceptions}</Field>
                )}
                <Field label="Binding">
                  {c.case_type === "RULE_DRIFT"
                    ? `supersedes v${c.expected_version}`
                    : "first canonical version"}
                </Field>
                {c.expected_fingerprint && (
                  <Field label="Bound fingerprint" mono>
                    <Hash value={c.expected_fingerprint} />
                  </Field>
                )}
                <Field label="Case fingerprint" mono>
                  <Hash value={c.case_fingerprint} />
                </Field>
                {c.invalid_reason && <Field label="Closed because">{c.invalid_reason}</Field>}
              </dl>
            </Panel>

            <Panel title="Lifecycle">
              <ol className="lifecycle">
                <li className="done">
                  Opened <span className="muted small">{timestamp(c.opened_at)}</span>
                </li>
                <li className={c.evidence_count > 0 ? "done" : "todo"}>
                  Evidence submitted{" "}
                  <span className="muted small">{c.evidence_count} source(s)</span>
                </li>
                <li className={c.frozen_at ? "done" : "todo"}>
                  Evidence frozen{" "}
                  <span className="muted small">
                    {c.frozen_at ? timestamp(c.frozen_at) : "not yet"}
                  </span>
                </li>
                <li className={c.verdict_at ? "done" : "todo"}>
                  Adjudicated{" "}
                  <span className="muted small">
                    {c.verdict_at ? timestamp(c.verdict_at) : "not yet"}
                  </span>
                </li>
                <li className={c.challenge_count > 0 ? "done" : "todo"}>
                  Challenges{" "}
                  <span className="muted small">{c.challenge_count} raised</span>
                </li>
                <li className={c.finalized_at ? "done" : "todo"}>
                  Finalized{" "}
                  <span className="muted small">
                    {c.finalized_at ? timestamp(c.finalized_at) : "not yet"}
                  </span>
                </li>
              </ol>
            </Panel>

            <Panel title="Release the rule">
              <p className="muted small">
                A rule allows one active case at a time. These permissionless exits
                release the lock when a case can no longer proceed.
              </p>
              <CaseExits record={c} onDone={reloadAll} />
            </Panel>

            {c.status === "EVIDENCE_OPEN" && (
              <Panel title="Actions: assemble the case">
                <ReadView state={bond} what="bond">
                  {(b) =>
                    b.has_bond ? (
                      <p className="muted small">
                        Bond locked ({gen(b.amount)}). Evidence can be frozen once
                        submitted.
                      </p>
                    ) : (
                      <LockBond
                        caseId={id}
                        requiredAmount={b.required_amount}
                        onDone={reloadAll}
                      />
                    )
                  }
                </ReadView>
                <SubmitEvidence caseId={id} vocab={vocab.data} onDone={reloadAll} />
                <FreezeEvidence caseId={id} onDone={reloadAll} />
              </Panel>
            )}
          </>
        )}
      </ReadView>

      <Panel title="Evidence">
        <p className="muted small">
          Submitted sources and their frozen excerpts. Source type and publication time
          are unverified submitter assertions - adjudication decides what they are worth.
        </p>
        <ReadView state={evidence} what="evidence" empty="No evidence submitted yet.">
          {(rows) => (
            <ul className="evidence-list">
              {rows.map((e) => (
                <li key={e.evidence_id}>
                  <div className="rule-head">
                    <Link to={`/evidence/${e.evidence_id}`}>{e.evidence_id}</Link>
                    <span className="tag">{e.claimed_type}</span>
                    <StatusBadge status={e.snapshot_status} />
                    <span className="muted small">{e.retrieval_mode}</span>
                  </div>
                  <p className="mono small break">{e.url_key}</p>
                  <p className="muted small">{e.relevance_note}</p>
                  {e.snapshot_status === "UNSNAPSHOTTED" && (
                    <SnapshotEvidence evidenceId={e.evidence_id} onDone={reloadAll} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </ReadView>
      </Panel>

      <ReadView state={frozen} what="frozen set">
        {(f) =>
          f.is_frozen ? (
            <Panel title="Frozen evidence set">
              <dl className="fields">
                <Field label="Frozen at">{timestamp(f.frozen_at)}</Field>
                <Field label="Evidence">{f.evidence_ids.join(", ")}</Field>
                <Field label="Case fingerprint" mono>
                  <Hash value={f.case_fingerprint} />
                </Field>
                <Field label="Scheme" mono>
                  {f.case_fingerprint_scheme}
                </Field>
              </dl>
              <ReadView state={snapshots} what="snapshot progress">
                {(s) => (
                  <p className="muted small">
                    {s.snapshot_complete} complete, {s.snapshot_failed} failed,{" "}
                    {s.snapshot_pending} pending -{" "}
                    {s.ready_for_adjudication
                      ? "ready for adjudication"
                      : "not ready for adjudication"}
                  </p>
                )}
              </ReadView>
              <ReadView state={snapshots} what="snapshot progress">
                {(s) =>
                  s.ready_for_adjudication && s.status === "EVIDENCE_FROZEN" ? (
                    <RequestAdjudication caseId={id} onDone={reloadAll} />
                  ) : (
                    <></>
                  )
                }
              </ReadView>
            </Panel>
          ) : (
            <></>
          )
        }
      </ReadView>

      <Panel title="Adjudication">
        <ReadView state={verdicts} what="verdicts" empty="Not adjudicated yet.">
          {(rows) => (
            <ol className="verdicts">
              {rows.map((v) => (
                <li key={v.verdict_id}>
                  <div className="rule-head">
                    <Link to={`/verdict/${v.verdict_id}`}>{v.verdict_id}</Link>
                    <StatusBadge status={v.decision} />
                    {v.replaces_verdict_id && (
                      <span className="muted small">replaces {v.replaces_verdict_id}</span>
                    )}
                    <span className="muted small">{relative(v.created_at)}</span>
                  </div>
                  <p>{v.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </ReadView>
      </Panel>

      <Panel title="Challenges">
        <ReadView state={window} what="challenge window">
          {(w) => (
            <p className="muted small">
              {w.in_challenge_window
                ? `Challenge window open - ${countdown(w.challenge_deadline)}. `
                : "Challenge window closed. "}
              {w.challenge_count}/{w.max_challenges} raised.
              {w.finalizable ? " This case can now be finalized." : ""}
            </p>
          )}
        </ReadView>

        <ReadView state={challenges} what="challenges" empty="No challenges raised.">
          {(rows) => (
            <ul className="challenges">
              {rows.map((ch) => (
                <li key={ch.challenge_id}>
                  <div className="rule-head">
                    <Link to={`/challenge/${ch.challenge_id}`}>{ch.challenge_id}</Link>
                    <span className="tag">{ch.ground}</span>
                    <StatusBadge status={ch.status} />
                  </div>
                  <p className="muted small">{ch.argument}</p>
                </li>
              ))}
            </ul>
          )}
        </ReadView>

        <ReadView state={window} what="challenge window">
          {(w) =>
            w.open_to_new_challenges ? (
              <OpenChallenge
                caseId={id}
                grounds={vocab.data?.challenge_grounds ?? []}
                onDone={reloadAll}
              />
            ) : (
              <></>
            )
          }
        </ReadView>

        <ReadView state={window} what="challenge window">
          {(w) => (w.finalizable ? <FinalizeCase caseId={id} onDone={reloadAll} /> : <></>)}
        </ReadView>
      </Panel>

      <Panel title="Bond">
        <ReadView state={bond} what="bond" empty="No bond posted.">
          {(b) =>
            b.has_bond ? (
              <>
                <dl className="fields">
                  <Field label="State">
                    <StatusBadge status={b.state} />
                  </Field>
                  <Field label="Amount">{gen(b.amount)}</Field>
                  <Field label="Disposition">{b.disposition}</Field>
                  <Field label="Refund">{gen(b.refund_amount)}</Field>
                  <Field label="Slash">{gen(b.slash_amount)}</Field>
                  <Field label="Settled">
                    {b.settled_at ? timestamp(b.settled_at) : "not settled"}
                  </Field>
                </dl>
                {b.payout_owed && <ExecutePayout caseId={id} onDone={reloadAll} />}
              </>
            ) : (
              <p className="muted">
                No bond posted. A case cannot be frozen or adjudicated without one.
              </p>
            )
          }
        </ReadView>
      </Panel>
    </div>
  );
}
