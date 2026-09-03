import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { getCurrentRules, getProtocol, listRules } from "../lib/contract";
import { PAGE_SIZE } from "../lib/config";
import { humanCategory, relative, shortHash } from "../lib/format";
import {
  CommunityDisclaimer,
  Field,
  Pagination,
  Panel,
  ReadView,
  StatusBadge,
} from "../components/ui";
import { ProposeRule } from "./actions/ProposeRule";

export default function ProtocolDetail() {
  const { id = "" } = useParams();
  const [offset, setOffset] = useState(0);

  const protocol = useRead(() => getProtocol(id), [id]);
  const current = useRead(() => getCurrentRules(id, offset, PAGE_SIZE), [id, offset]);
  const all = useRead(() => listRules(id, 0, PAGE_SIZE), [id]);

  return (
    <div className="page">
      <ReadView state={protocol} what="protocol">
        {(p) => (
          <>
            <header className="page-head">
              <h1>{p.display_name}</h1>
              <code className="mono">{p.protocol_id}</code>
            </header>
            <CommunityDisclaimer />

            <Panel title="Namespace">
              <dl className="fields">
                <Field label="Identity">
                  <StatusBadge status={p.officially_verified ? "VERIFIED" : "UNVERIFIED"} />
                  <span className="muted small">
                    {" "}
                    V1 cannot cryptographically prove protocol ownership.
                  </span>
                </Field>
                <Field label="Registrant" mono>
                  {shortHash(p.registrant, 10, 6)}
                  <span className="muted small"> (no authority over rules)</span>
                </Field>
                <Field label="Homepage">
                  {p.homepage_url ? (
                    <a href={p.homepage_url} rel="noreferrer noopener" target="_blank">
                      {p.homepage_url}
                    </a>
                  ) : (
                    <span className="muted">not provided</span>
                  )}
                  <span className="muted small"> - submitter assertion, unverified</span>
                </Field>
                <Field label="Registered">{relative(p.created_at)}</Field>
                <Field label="Open cases">{p.open_case_count}</Field>
              </dl>
            </Panel>
          </>
        )}
      </ReadView>

      <Panel title="Canonical rules">
        <p className="muted small">
          Evidence-backed commitments only. Proposed topics with no adjudicated version
          are listed separately below and never appear here.
        </p>
        <ReadView
          state={current}
          what="canonical rules"
          empty="No rule has been established by adjudication yet."
        >
          {(rows) => (
            <>
              <ul className="rules">
                {rows.map((r) => (
                  <li key={r.rule_id}>
                    <div className="rule-head">
                      <Link to={`/rule/${r.rule_id}`}>
                        <strong>{r.title}</strong>
                      </Link>
                      <span className="tag">{humanCategory(r.category)}</span>
                      <StatusBadge status={r.disputed ? "DISPUTED" : "CURRENT"} />
                      <span className="muted small">v{r.version}</span>
                    </div>
                    <p className="rule-text">{r.text}</p>
                    <p className="muted small">
                      {r.scope ? `Scope: ${r.scope}. ` : ""}
                      Basis: {r.effective_basis} - established {relative(r.established_at)}
                    </p>
                  </li>
                ))}
              </ul>
              <Pagination
                offset={offset}
                size={PAGE_SIZE}
                count={rows.length}
                onChange={setOffset}
              />
            </>
          )}
        </ReadView>
      </Panel>

      <Panel title="Proposed topics">
        <p className="muted small">
          A topic is not a commitment. These carry no rule text until a RULE_CLAIM is
          adjudicated.
        </p>
        <ReadView state={all} what="rules" empty="No topics proposed yet.">
          {(rows) => {
            const unverified = rows.filter((r) => !r.has_canonical_version);
            if (unverified.length === 0) {
              return <p className="muted empty">Every rule here has an adjudicated version.</p>;
            }
            return (
              <ul className="rules muted-list">
                {unverified.map((r) => (
                  <li key={r.rule_id}>
                    <div className="rule-head">
                      <Link to={`/rule/${r.rule_id}`}>{r.title}</Link>
                      <span className="tag">{humanCategory(r.category)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                  </li>
                ))}
              </ul>
            );
          }}
        </ReadView>
      </Panel>

      <Panel title="Propose a rule topic">
        <ProposeRule protocolId={id} onDone={all.reload} />
      </Panel>
    </div>
  );
}
