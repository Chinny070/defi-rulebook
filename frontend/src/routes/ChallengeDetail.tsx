import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { getChallenge } from "../lib/contract";
import { shortHash, timestamp } from "../lib/format";
import { CaseLink, Field, Panel, ReadView, StatusBadge } from "../components/ui";
import { ResolveChallenge } from "./actions/CaseActions";

export default function ChallengeDetail() {
  const { id = "" } = useParams();
  const challenge = useRead(() => getChallenge(id), [id]);

  return (
    <div className="page">
      <h1>Challenge {id}</h1>
      <ReadView state={challenge} what="challenge">
        {(ch) => (
          <>
            <Panel title="Alleged defect">
              <div className="rule-head">
                <span className="tag">{ch.ground}</span>
                <StatusBadge status={ch.status} />
              </div>
              <blockquote className="canonical untrusted">{ch.argument}</blockquote>
              <p className="muted small">
                An unverified participant assertion. It is evaluated on re-adjudication,
                never obeyed.
              </p>
              <dl className="fields">
                <Field label="Case"><CaseLink id={ch.case_id} /></Field>
                <Field label="Challenger" mono>{shortHash(ch.challenger, 10, 6)}</Field>
                <Field label="Targets verdict">
                  <Link to={`/verdict/${ch.target_verdict_id}`}>{ch.target_verdict_id}</Link>
                </Field>
                <Field label="Cited evidence">
                  {ch.cited_evidence_ids.length > 0
                    ? ch.cited_evidence_ids.map((e) => (
                        <Link key={e} to={`/evidence/${e}`} className="chip">{e}</Link>
                      ))
                    : "none"}
                </Field>
                {ch.resulting_verdict_id && (
                  <Field label="Resulting verdict">
                    <Link to={`/verdict/${ch.resulting_verdict_id}`}>{ch.resulting_verdict_id}</Link>
                  </Field>
                )}
                <Field label="Raised">{timestamp(ch.created_at)}</Field>
                <Field label="Resolved">
                  {ch.resolved_at ? timestamp(ch.resolved_at) : "open"}
                </Field>
              </dl>
            </Panel>

            {ch.status === "OPEN" && (
              <Panel title="Resolve">
                <ResolveChallenge
                  challengeId={ch.challenge_id}
                  caseId={ch.case_id}
                  onDone={challenge.reload}
                />
              </Panel>
            )}
          </>
        )}
      </ReadView>
    </div>
  );
}
