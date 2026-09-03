import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { useWallet } from "./hooks/useWallet";
import { CHAIN_NAME, IS_CONFIGURED } from "./lib/config";
import { shortHash } from "./lib/format";

import Home from "./routes/Home";
import Protocols from "./routes/Protocols";
import ProtocolDetail from "./routes/ProtocolDetail";
import RuleDetail from "./routes/RuleDetail";
import RuleHistory from "./routes/RuleHistory";
import CaseDetail from "./routes/CaseDetail";
import EvidenceDetail from "./routes/EvidenceDetail";
import VerdictDetail from "./routes/VerdictDetail";
import ChallengeDetail from "./routes/ChallengeDetail";
import Account from "./routes/Account";
import Status from "./routes/Status";
import Methodology from "./routes/Methodology";
import NotFound from "./routes/NotFound";
import { WalletContext } from "./walletContext";

export default function App() {
  const wallet = useWallet();

  return (
    <WalletContext.Provider value={wallet}>
      <BrowserRouter>
        <header className="topbar">
          <Link to="/" className="brand">
            <strong>DEFI RULEBOOK</strong>
            <span className="tagline">Challengeable Protocol Commitments</span>
          </Link>
          <nav>
            <NavLink to="/protocols">Protocols</NavLink>
            <NavLink to="/methodology">Methodology</NavLink>
            <NavLink to="/account">Account</NavLink>
            <NavLink to="/status">Status</NavLink>
          </nav>
          <div className="wallet">
            {wallet.address ? (
              <button className="ghost" onClick={wallet.disconnect} title={wallet.address}>
                {shortHash(wallet.address, 6, 4)}
              </button>
            ) : (
              <button className="ghost" onClick={wallet.connect} disabled={wallet.connecting}>
                {wallet.connecting ? "Connecting..." : "Connect wallet"}
              </button>
            )}
          </div>
        </header>

        {wallet.wrongNetwork && (
          <div className="banner warn">
            Wrong network. Switch your wallet to <code>{CHAIN_NAME}</code> before taking
            any action.
          </div>
        )}
        {!IS_CONFIGURED && (
          <div className="banner warn">
            No contract address configured - the explorer cannot read anything yet. See{" "}
            <Link to="/status">Status</Link>.
          </div>
        )}

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/protocols" element={<Protocols />} />
            <Route path="/protocol/:id" element={<ProtocolDetail />} />
            <Route path="/rule/:id" element={<RuleDetail />} />
            <Route path="/rule/:id/history" element={<RuleHistory />} />
            <Route path="/case/:id" element={<CaseDetail />} />
            <Route path="/evidence/:id" element={<EvidenceDetail />} />
            <Route path="/verdict/:id" element={<VerdictDetail />} />
            <Route path="/challenge/:id" element={<ChallengeDetail />} />
            <Route path="/account" element={<Account />} />
            <Route path="/status" element={<Status />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        <footer>
          <p className="muted small">
            Rules reflect adjudicated public evidence, not protocol endorsement. A
            canonical rule is what the frozen evidence establishes - not a guarantee that
            a protocol will behave that way. Reading requires no wallet.
          </p>
        </footer>
      </BrowserRouter>
    </WalletContext.Provider>
  );
}
