import { Link, useParams } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { getEvidence, getEvidenceSnapshot } from "../lib/contract";
import { timestamp } from "../lib/format";
import { CaseLink, Field, Hash, Panel, ReadView, StatusBadge } from "../components/ui";

export default function EvidenceDetail() {
  const { id = "" } = useParams();
  const evidence = useRead(() => getEvidence(id), [id]);
  const snapshot = useRead(() => getEvidenceSnapshot(id), [id]);

  return (
    <div className="page">
      <h1>Evidence {id}</h1>
      <p className="muted">
        This is <strong>submitted evidence</strong>, not proof. What it establishes is
        decided by GenLayer adjudication, and recorded separately.
      </p>

      <ReadView state={evidence} what="evidence">
        {(e) => (
          <Panel title="Submission">
            <dl className="fields">
              <Field label="Case"><CaseLink id={e.case_id} /></Field>
              <Field label="Source URL">
                <a href={e.url} rel="noreferrer noopener" target="_blank" className="break">{e.url}</a>
              </Field>
              <Field label="Normalized identity" mono>{e.url_key}</Field>
              <Field label="Source family" mono>{e.source_key}</Field>
              <Field label="Retrieval method">{e.retrieval_mode}</Field>
              <Field label="Anchors">{e.anchors.join(", ")}</Field>
              <Field label="Claimed type">
                {e.claimed_type}
                <span className="muted small"> - unverified submitter assertion</span>
              </Field>
              <Field label="Claimed publication">
                {e.claimed_published_known ? timestamp(e.claimed_published_at) : "unknown"}
              </Field>
              <Field label="Relevance note">{e.relevance_note}</Field>
              <Field label="Submitted">{timestamp(e.submitted_at)}</Field>
            </dl>
          </Panel>
        )}
      </ReadView>

      <ReadView state={snapshot} what="snapshot">
        {(s) => (
          <Panel title="Frozen snapshot">
            <dl className="fields">
              <Field label="Status"><StatusBadge status={s.retrieval_status} /></Field>
              {s.failure_reason && <Field label="Failure reason">{s.failure_reason}</Field>}
              <Field label="Attempts">{s.attempts}</Field>
              <Field label="Retrieved">{s.retrieved_at ? timestamp(s.retrieved_at) : "-"}</Field>
              <Field label="Excerpt length">
                {s.excerpt_length} / {s.max_excerpt_length} characters
              </Field>
              <Field label="Fingerprint" mono><Hash value={s.fingerprint} /></Field>
              <Field label="Scheme" mono>{s.fingerprint_scheme}</Field>
            </dl>

            {s.normalized_excerpt ? (
              <>
                <h3>Excerpt evaluated by GenLayer</h3>
                <p className="muted small">
                  Untrusted external content, stored verbatim. These are the exact bytes
                  that were hashed and adjudicated - recompute sha256 over this text to
                  check the fingerprint yourself.
                </p>
                <pre className="excerpt untrusted">{s.normalized_excerpt}</pre>
              </>
            ) : (
              <p className="muted">
                No excerpt: this source produced no usable evidence, so it contributes
                nothing to adjudication.
              </p>
            )}
          </Panel>
        )}
      </ReadView>

      <p className="muted small">
        <Link to="/methodology">How excerpts and fingerprints are produced</Link>
      </p>
    </div>
  );
}
