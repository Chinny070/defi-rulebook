import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import {
  getCurrentRuleVersion,
  getDisputeStatus,
  getRule,
  listRuleCases,
  listRuleVersions,
} from "../lib/contract";
import { humanCategory, relative } from "../lib/format";
import {
  CaseLink,
  CommunityDisclaimer,
  Field,
  Hash,
  Panel,
  ReadView,
  StatusBadge,
} from "../components/ui";
import { OpenCase } from "./actions/OpenCase";

export default function RuleDetail() {
  const { id = "" } = useParams();
  const rule = useRead(() => getRule(id), [id]);
  const current = useRead(() => getCurrentRuleVersion(id), [id]);
  const dispute = useRead(() => getDisputeStatus(id), [id]);
  const versions = useRead(() => listRuleVersions(id, 0, 50), [id]);
  const cases = useRead(() => listRuleCases(id, 0, 20), [id]);

  return (
    <div className="page">
      <ReadView state={rule} what="rule">
        {(r) => (
          <>
            <header className="page-head">
              <div>
                <p className="crumb">
                  <Link to={`/protocol/${r.protocol_id}`}>{r.protocol_id}</Link>
                </p>
                <h1>{r.title}</h1>
              </div>
              <div className="head-tags">
                <span className="tag">{humanCategory(r.category)}</span>
                <StatusBadge status={r.status} />
              </div>
            </header>
            <CommunityDisclaimer />

            {!r.has_canonical_version && (
              <div className="panel warn">
                <strong>No canonical version.</strong>
                <p>
                  This is a proposed topic. Nothing here is an established commitment
                  until a RULE_CLAIM is adjudicated and finalized.
                </p>
              </div>
            )}
          </>
        )}
      </ReadView>

      <ReadView state={current} what="current version" empty="Not yet established.">
        {(v) =>
          v.has_canonical_version ? (
            <Panel title="Current commitment">
              <blockquote className="canonical">{v.text}</blockquote>
              <dl className="fields">
                <Field label="Version">
                  v{v.version} <StatusBadge status={v.status} />
                </Field>
                {v.scope && <Field label="Scope">{v.scope}</Field>}
                {v.exceptions && <Field label="Exceptions">{v.exceptions}</Field>}
                <Field label="Evidence basis">{v.effective_basis}</Field>
                <Field label="Established">{relative(v.established_at)}</Field>
                <Field label="Originating case">
                  <CaseLink id={v.originating_case_id} />
                </Field>
                <Field label="Verdict">
                  <Link to={`/verdict/${v.originating_verdict_id}`}>
                    {v.originating_verdict_id}
                  </Link>
                </Field>
                <Field label="Version fingerprint" mono>
                  <Hash value={v.fingerprint} />
                </Field>
                <Field label="Evidence digest" mono>
                  <Hash value={v.evidence_digest} />
                </Field>
              </dl>
            </Panel>
          ) : (
            <p className="muted empty">No canonical version yet.</p>
          )
        }
      </ReadView>

      <ReadView state={dispute} what="dispute status">
        {(d) =>
          d.disputed ? (
            <div className="panel warn">
              <strong>
                {d.active_drift_case ? "Active drift case" : "Active case"} on this rule
              </strong>
              <p>
                Case <CaseLink id={d.active_case_id} /> is {d.active_case_status}. The
                commitment above may change.
              </p>
            </div>
          ) : (
            <></>
          )
        }
      </ReadView>

      <Panel
        title="Version history"
        actions={<Link to={`/rule/${id}/history`}>Full history</Link>}
      >
        <ReadView state={versions} what="versions" empty="No versions yet.">
          {(rows) => (
            <ol className="timeline">
              {rows.map((v) => (
                <li key={v.version_id} className={v.status === "CURRENT" ? "current" : ""}>
                  <span className="dot" />
                  <div>
                    <strong>v{v.version}</strong> <StatusBadge status={v.status} />
                    <p className="rule-text">{v.text}</p>
                    <p className="muted small">
                      {relative(v.established_at)} - from <CaseLink id={v.originating_case_id} />
                      {v.predecessor > 0 ? ` - supersedes v${v.predecessor}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </ReadView>
      </Panel>

      <Panel title="Cases">
        <ReadView state={cases} what="cases" empty="No cases opened on this rule.">
          {(rows) => (
            <table className="grid">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Evidence</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.case_id}>
                    <td>
                      <CaseLink id={c.case_id} />
                    </td>
                    <td>{c.case_type}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>{c.evidence_count}</td>
                    <td className="muted small">{relative(c.opened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReadView>
      </Panel>

      <ReadView state={rule} what="rule">
        {(r) => (
          <Panel title={r.has_canonical_version ? "Report drift" : "Open a rule claim"}>
            <OpenCase rule={r} onDone={cases.reload} />
          </Panel>
        )}
      </ReadView>
    </div>
  );
}
