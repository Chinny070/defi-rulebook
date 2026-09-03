import { useRead } from "../hooks/useRead";
import { getConfig, getVocabularies } from "../lib/contract";
import { Panel, ReadView } from "../components/ui";

export default function Methodology() {
  const vocab = useRead(() => getVocabularies(), []);
  const config = useRead(() => getConfig(), []);

  return (
    <div className="page">
      <h1>Methodology</h1>

      <Panel title="What a canonical rule is">
        <p>
          A canonical rule is a statement that <strong>authoritative public evidence,
          frozen at a point in time, establishes a particular operative commitment</strong>.
          It is not a guarantee that the protocol will honour it, that deployed code
          implements it, that governance will not change it tomorrow, or that the
          protocol is safe.
        </p>
      </Panel>

      <Panel title="How evidence is frozen">
        <ol>
          <li>A submitter provides a URL, a retrieval method and 1-3 anchor terms.</li>
          <li>
            Freezing locks the exact evidence set. After it, nothing about the case can
            change - not the evidence, not the anchors, not the claim text.
          </li>
          <li>
            Retrieval normalizes the page (NFKC, control characters stripped, whitespace
            collapsed) and extracts a bounded window around the first matching anchor.
          </li>
          <li>
            The excerpt is hashed. The bytes stored, the bytes hashed and the bytes the
            model reads are the same bytes - so you can recompute the fingerprint from
            what is displayed.
          </li>
        </ol>
        <p className="muted small">
          A page can change after it is snapshotted. The record captures one moment and
          says so; it never claims a URL is immutable.
        </p>
      </Panel>

      <Panel title="How adjudication works">
        <p>
          Validators reason only over frozen excerpts - never the live web, never a source
          outside the case. The model sees no address, no bond amount and no economic
          value of any kind.
        </p>
        <p>
          The output must match a strict schema, may only cite evidence frozen into that
          case, and its decision is <strong>recomputed by the contract</strong> from its
          own dimension findings. If the two disagree, the whole transaction is rejected.
        </p>
        <ReadView state={vocab} what="dimensions">
          {(v) => (
            <>
              <h3>Dimensions</h3>
              <ul className="chips">
                {v.dimensions_drift.map((d) => (
                  <li key={d} className="chip">{d}</li>
                ))}
              </ul>
              <p className="muted small">
                Six apply to a first claim; the seventh, EXISTING_RULE_CONSISTENCY, is
                required only for drift.
              </p>
              <h3>Findings</h3>
              <ul className="chips">
                {v.findings.map((f) => (
                  <li key={f} className="chip">{f}</li>
                ))}
              </ul>
              <h3>Challenge grounds</h3>
              <ul className="chips">
                {v.challenge_grounds.map((g) => (
                  <li key={g} className="chip">{g}</li>
                ))}
              </ul>
            </>
          )}
        </ReadView>
      </Panel>

      <Panel title="Fingerprint schemes">
        <ReadView state={config} what="schemes">
          {(c) => (
            <ul>
              <li>
                <code className="mono">{c.case_fingerprint_scheme}</code> - binds the case
                inputs and the frozen evidence set.
              </li>
              <li>
                <code className="mono">{c.snapshot_fingerprint_scheme}</code> - binds one
                excerpt to the URL, retrieval method, anchors and extraction parameters.
              </li>
              <li>
                <code className="mono">{c.version_fingerprint_scheme}</code> - binds a
                canonical version to its text, predecessor, case and evidence digest.
              </li>
            </ul>
          )}
        </ReadView>
        <p className="muted small">
          All three hash a sequence of length-prefixed fields joined with a pipe, so no
          field boundary can be forged by content.
        </p>
      </Panel>

      <Panel title="Limits worth knowing">
        <ul>
          <li>Protocol identity cannot be cryptographically proven in V1.</li>
          <li>Registration reserves a name and grants no authority whatsoever.</li>
          <li>Adjudication sees only the evidence that was frozen - cherry-picking is bounded by challenges, not eliminated.</li>
          <li>An excerpt is a window, not the whole page.</li>
          <li>Consensus can be undetermined; this app reports that as its own outcome rather than as success or failure.</li>
        </ul>
      </Panel>
    </div>
  );
}
