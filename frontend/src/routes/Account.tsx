import { useWalletContext } from "../walletContext";
import { CHAIN_NAME } from "../lib/config";
import { Panel } from "../components/ui";

/**
 * Deliberately thin. The contract has no per-address index, and building one
 * in the browser would mean scanning every case - which is exactly the
 * unbounded read the architecture forbids. So this page reports what it can
 * know and says plainly what it cannot, rather than pretending.
 */
export default function Account() {
  const wallet = useWalletContext();

  return (
    <div className="page">
      <h1>Account</h1>

      <Panel title="Wallet">
        {wallet.address ? (
          <dl className="fields">
            <div className="field">
              <dt>Address</dt>
              <dd className="mono">{wallet.address}</dd>
            </div>
            <div className="field">
              <dt>Network</dt>
              <dd>
                {wallet.chainId ?? "-"}
                {wallet.wrongNetwork ? ` - expected ${CHAIN_NAME}` : ""}
              </dd>
            </div>
          </dl>
        ) : (
          <>
            <p className="muted">
              No wallet connected. Everything in the explorer is readable without one.
            </p>
            <button className="primary" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Connecting..." : "Connect wallet"}
            </button>
            {wallet.error && <p className="small error-text">{wallet.error}</p>}
          </>
        )}
      </Panel>

      <Panel title="Your activity">
        <p className="muted">
          The contract does not index cases or bonds by address, and this app has no
          backend or indexer to build one. Scanning every case in the browser would be an
          unbounded read, which the architecture rules out.
        </p>
        <p className="muted">
          To follow your own cases, open them from the rule or protocol page - your
          address appears as the reporter, submitter or challenger, and the bond panel on
          each case shows its state and whether a payout is owed.
        </p>
      </Panel>
    </div>
  );
}
