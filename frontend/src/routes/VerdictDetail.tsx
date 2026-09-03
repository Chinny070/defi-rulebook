import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { getVerdict } from "../lib/contract";
import { timestamp } from "../lib/format";
import { CaseLink, Field, Hash, Panel, ReadView, StatusBadge } from "../components/ui";

export default function VerdictDetail() {
  const { id = "" } = useParams();
  const verdict = useRead(() => getVerdict(id), [id]);

  return (
    <div className="page">
      <h1>Verdict {id}</h1>
      <p className="muted">
        A GenLayer adjudication result over frozen evidence. The decision shown here was
        recomputed by the contract from these findings and rejected if they disagreed.
      </p>

      <ReadView state={verdict} what="verdict">
        {(v) => (
          <>
            <Panel title="Decision">
              <StatusBadge status={v.decision} />
              <p>{v.summary}</p>
              <dl className="fields">
                <Field label="Case"><CaseLink id={v.case_id} /></Field>
                <Field label="Index">#{v.index}</Field>
                {v.replaces_verdict_id && (
                  <Field label="Replaces">
                    <Link to={`/verdict/${v.replaces_verdict_id}`}>{v.replaces_verdict_id}</Link>
                  </Field>
                )}
                <Field label="Evidence used">
                  {v.evidence_used.length > 0
                    ? v.evidence_used.map((e) => (
                        <Link key={e} to={`/evidence/${e}`} className="chip">{e}</Link>
                      ))
                    : "none cited"}
                </Field>
                <Field label="Case fingerprint" mono><Hash value={v.case_fingerprint} /></Field>
                <Field label="Recorded">{timestamp(v.created_at)}</Field>
              </dl>
            </Panel>

            <Panel title="Dimension findings">
              <table className="grid">
                <thead>
                  <tr><th>Dimension</th><th>Finding</th><th>Reasoning</th></tr>
                </thead>
                <tbody>
                  {v.dimensions.map((d) => (
                    <tr key={d.name}>
                      <td className="mono">{d.name}</td>
                      <td><StatusBadge status={d.result} /></td>
                      <td>{d.reason || <span className="muted">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">
                Consensus status: this verdict exists in contract state, which means the
                transaction that produced it was committed. A verdict that never
                committed would not appear here at all.
              </p>
            </Panel>
          </>
        )}
      </ReadView>
    </div>
  );
}
