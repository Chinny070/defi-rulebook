import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { listRuleVersions } from "../lib/contract";
import { timestamp } from "../lib/format";
import { CaseLink, Field, Hash, Panel, ReadView, StatusBadge } from "../components/ui";

export default function RuleHistory() {
  const { id = "" } = useParams();
  const versions = useRead(() => listRuleVersions(id, 0, 50), [id]);

  return (
    <div className="page">
      <p className="crumb">
        <Link to={`/rule/${id}`}>back to rule</Link>
      </p>
      <h1>Version history</h1>
      <p className="muted">
        Every version ever established for this rule. Superseded versions keep their
        text, evidence and lineage - only the status flag changes. Nothing is removed.
      </p>

      <ReadView state={versions} what="versions" empty="No versions established yet.">
        {(rows) =>
          rows.map((v) => (
            <Panel key={v.version_id} title={`v${v.version}`}>
              <StatusBadge status={v.status} />
              <blockquote className="canonical">{v.text}</blockquote>
              <dl className="fields">
                {v.scope && <Field label="Scope">{v.scope}</Field>}
                {v.exceptions && <Field label="Exceptions">{v.exceptions}</Field>}
                <Field label="Predecessor">{v.predecessor > 0 ? `v${v.predecessor}` : "none"}</Field>
                <Field label="Evidence basis">{v.effective_basis}</Field>
                <Field label="Originating case"><CaseLink id={v.originating_case_id} /></Field>
                <Field label="Originating verdict">
                  <Link to={`/verdict/${v.originating_verdict_id}`}>{v.originating_verdict_id}</Link>
                </Field>
                <Field label="Established">{timestamp(v.established_at)}</Field>
                <Field label="Fingerprint" mono><Hash value={v.fingerprint} /></Field>
                <Field label="Evidence digest" mono><Hash value={v.evidence_digest} /></Field>
              </dl>
            </Panel>
          ))
        }
      </ReadView>
    </div>
  );
}
