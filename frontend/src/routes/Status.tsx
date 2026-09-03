import { useRead } from "../hooks/useRead";
import { getCaps, getConfig, getCounts, getEconomicConfig } from "../lib/contract";
import { CHAIN_NAME, CONTRACT_ADDRESS, IS_CONFIGURED } from "../lib/config";
import { gen, timestamp } from "../lib/format";
import { useWalletContext } from "../walletContext";
import { Field, Panel, ReadView, StatusBadge } from "../components/ui";

export default function Status() {
  const wallet = useWalletContext();
  const config = useRead(() => getConfig(), []);
  const caps = useRead(() => getCaps(), []);
  const counts = useRead(() => getCounts(), []);
  const economics = useRead(() => getEconomicConfig(), []);
  // Derived from the read itself - no effect, no cascading render.
  const lastRefresh = config.loadedAt;

  return (
    <div className="page">
      <h1>Status</h1>

      <Panel title="Connection">
        <dl className="fields">
          <Field label="Network">{CHAIN_NAME}</Field>
          <Field label="Contract address" mono>
            {IS_CONFIGURED ? CONTRACT_ADDRESS : "not configured"}
          </Field>
          <Field label="Read status">
            {!IS_CONFIGURED ? (
              <StatusBadge status="NONE" />
            ) : config.error ? (
              <StatusBadge status="SNAPSHOT_FAILED" />
            ) : config.loading ? (
              <StatusBadge status="OPEN" />
            ) : (
              <StatusBadge status="ACTIVE" />
            )}
          </Field>
          <Field label="Last successful refresh">
            {lastRefresh ? timestamp(lastRefresh) : "never"}
          </Field>
          <Field label="Wallet">
            {wallet.address ? wallet.address : "not connected (not needed for reading)"}
          </Field>
          <Field label="Wallet network">
            {wallet.chainId ?? "-"}
            {wallet.wrongNetwork ? " - wrong network" : ""}
          </Field>
        </dl>
        {config.error && <p className="mono small error-text">{config.error}</p>}
      </Panel>

      <Panel title="Contract">
        <ReadView state={config} what="contract config">
          {(c) => (
            <dl className="fields">
              <Field label="Name">{c.contract_name}</Field>
              <Field label="Version">{c.contract_version}</Field>
              <Field label="Schema version">{c.schema_version}</Field>
              <Field label="Paused">
                <StatusBadge status={c.paused ? "DISPUTED" : "ACTIVE"} />
              </Field>
              <Field label="Dimension set">{c.dimension_set_version}</Field>
              <Field label="Case fingerprint scheme" mono>{c.case_fingerprint_scheme}</Field>
              <Field label="Snapshot scheme" mono>{c.snapshot_fingerprint_scheme}</Field>
              <Field label="Version scheme" mono>{c.version_fingerprint_scheme}</Field>
              <Field label="Challenge window">{c.challenge_window_seconds / 3600} hours</Field>
              <Field label="Evidence window">{c.evidence_window_seconds / 86400} days</Field>
            </dl>
          )}
        </ReadView>
      </Panel>

      <Panel title="Economics">
        <ReadView state={economics} what="economics">
          {(e) => (
            <dl className="fields">
              <Field label="Proposer bond">{gen(e.case_bond)}</Field>
              <Field label="Caller-selected amounts">
                {e.caller_selected_amounts ? "yes" : "no - fixed by config"}
              </Field>
              <Field label="Claim slash">{e.claim_slash_bps / 100}%</Field>
              <Field label="Drift slash">{e.drift_slash_bps / 100}%</Field>
              <Field label="Challenger bonds">{e.challenger_bonds ? "yes" : "not in V1"}</Field>
              <Field label="Visible to adjudication">
                {e.bond_visible_to_adjudication ? "yes" : "no"}
              </Field>
            </dl>
          )}
        </ReadView>
      </Panel>

      <Panel title="Registry counts">
        <ReadView state={counts} what="counts">
          {(c) => (
            <dl className="stats">
              <div><dt>Protocols</dt><dd>{c.protocols}</dd></div>
              <div><dt>Rules</dt><dd>{c.rule_seq}</dd></div>
              <div><dt>Cases</dt><dd>{c.case_seq}</dd></div>
              <div><dt>Evidence</dt><dd>{c.evidence_seq}</dd></div>
              <div><dt>Verdicts</dt><dd>{c.verdict_seq}</dd></div>
              <div><dt>Challenges</dt><dd>{c.challenge_seq}</dd></div>
              <div><dt>Bonds</dt><dd>{c.bond_seq}</dd></div>
            </dl>
          )}
        </ReadView>
      </Panel>

      <Panel title="Limits">
        <ReadView state={caps} what="caps">
          {(c) => (
            <dl className="fields">
              <Field label="Evidence per case">{c.max_evidence_per_case}</Field>
              <Field label="Challenges per case">{c.max_challenges_per_case}</Field>
              <Field label="Versions per rule">{c.max_versions_per_rule}</Field>
              <Field label="Excerpt length">{c.max_excerpt_len} characters</Field>
              <Field label="Page size">{c.default_page_size} (max {c.max_page_size})</Field>
            </dl>
          )}
        </ReadView>
      </Panel>
    </div>
  );
}
