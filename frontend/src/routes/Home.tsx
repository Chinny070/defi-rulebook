import { Link } from "react-router-dom";
import { useRead } from "../hooks/useRead";
import { getCounts, listProtocols } from "../lib/contract";
import { Panel, ReadView } from "../components/ui";

export default function Home() {
  const counts = useRead(() => getCounts(), []);
  const protocols = useRead(() => listProtocols(0, 6), []);

  return (
    <div className="page">
      <section className="hero">
        <h1>Turn protocol documentation into something users can challenge.</h1>
        <p className="lede">
          DeFi rules live in docs, forums, governance decisions and specs that routinely
          disagree with each other and with reality. DEFI RULEBOOK turns that into an
          append-only, evidence-backed record of what a protocol has actually committed
          to - and lets anyone attack it when the world changes.
        </p>
      </section>

      <Panel title="How a rule becomes canonical">
        <ol className="flow">
          <li>
            <strong>Someone makes a claim.</strong> A reporter bonds GEN and opens a
            RULE_CLAIM (a first commitment) or a RULE_DRIFT (the canonical rule has gone
            stale).
          </li>
          <li>
            <strong>Evidence is frozen.</strong> Source URLs, retrieval method and
            anchors are locked. After this nothing about the case can change.
          </li>
          <li>
            <strong>Pages are retrieved and fingerprinted.</strong> A bounded excerpt is
            stored on-chain with a hash, so you can see the exact text that was judged.
          </li>
          <li>
            <strong>GenLayer validators adjudicate.</strong> Seven fixed dimensions,
            strict schema, and a deterministic gate that recomputes the decision from the
            findings and rejects it if they disagree.
          </li>
          <li>
            <strong>Anyone can challenge.</strong> Naming one specific defect - not
            &ldquo;I disagree&rdquo; - triggers re-adjudication over the same evidence.
          </li>
          <li>
            <strong>Only then does a version exist.</strong> Immutable, with lineage back
            to the evidence, and the bond settles.
          </li>
        </ol>
      </Panel>

      <Panel title="What this proves - and what it does not">
        <div className="two-col">
          <div>
            <h3>It establishes</h3>
            <p>
              That authoritative public evidence, frozen at a point in time, supports a
              particular operative commitment.
            </p>
          </div>
          <div>
            <h3>It does not establish</h3>
            <p>
              That the protocol will honour it, that deployed code implements it, that
              governance cannot change it tomorrow, or that the protocol is safe.
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Registry"
        actions={<Link to="/protocols">Browse all protocols</Link>}
      >
        <ReadView
          state={counts}
          what="registry stats"
          empty="No activity yet."
        >
          {(data) => (
            <dl className="stats">
              <div>
                <dt>Protocols</dt>
                <dd>{data.protocols}</dd>
              </div>
              <div>
                <dt>Rules</dt>
                <dd>{data.rule_seq}</dd>
              </div>
              <div>
                <dt>Cases</dt>
                <dd>{data.case_seq}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{data.evidence_seq}</dd>
              </div>
              <div>
                <dt>Verdicts</dt>
                <dd>{data.verdict_seq}</dd>
              </div>
              <div>
                <dt>Challenges</dt>
                <dd>{data.challenge_seq}</dd>
              </div>
            </dl>
          )}
        </ReadView>

        <ReadView
          state={protocols}
          what="protocols"
          empty="No protocols registered yet."
        >
          {(rows) => (
            <ul className="cards">
              {rows.map((p) => (
                <li key={p.protocol_id}>
                  <Link to={`/protocol/${p.protocol_id}`}>
                    <strong>{p.display_name}</strong>
                    <span className="muted small">{p.protocol_id}</span>
                    <span className="small">
                      {p.rule_count} rule{p.rule_count === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ReadView>
      </Panel>

      <p className="muted">
        Everything here is readable without a wallet. A wallet is needed only to file or
        challenge a case.
      </p>
    </div>
  );
}
