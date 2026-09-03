# Stage 9 — Rule Explorer Frontend

A public transparency explorer, not a dashboard. Frontend only: no backend, no database, no API server, no indexer. Every byte on screen comes from a direct contract read.

Nothing was deployed. No transaction was broadcast. No GEN moved.

---

## 1. Architecture

```
frontend/
  index.html
  vite.config.ts          vite + vitest
  eslint.config.js
  .env.example            VITE_CONTRACT_ADDRESS, VITE_CHAIN
  src/
    main.tsx  App.tsx  styles.css  walletContext.ts
    lib/
      config.ts           chain + address resolution, page caps
      client.ts           genlayer-js read/write clients
      consensus.ts        receipt -> COMMITTED | UNDETERMINED | FAILED | PENDING
      contract.ts         typed read layer over all 30 views
      writeFlow.ts        the one write state machine
      types.ts            contract-shaped TypeScript types
      format.ts           display helpers
    hooks/
      useRead.ts          loading / error / empty / unconfigured
      useWallet.ts        connection, account and chain changes
      useWriteFlow.ts     the only way a component may write
    components/
      ui.tsx              ReadView, StatusBadge, Pagination, disclaimer
      WriteAction.tsx     renders the full write pipeline
    routes/               12 pages
      actions/            wallet flows, one per contract write
    __tests__/            39 tests
```

**Stack:** React 19, TypeScript 5.9, Vite 8, `genlayer-js` 1.1, React Router 7, Vitest 4.

**State management: none.** There is no store. Each page composes `useRead` calls, and a write returns a `reload()` that re-reads exactly what changed. A cache would be a place for stale data to masquerade as current, which is the one thing this app must never do.

**Contract interaction layer.** `lib/contract.ts` wraps every view as a typed function. Components never touch `genlayer-js` directly. Every list call passes through `boundedLimit()`, which clamps to 50 before the request leaves the browser — the contract clamps too, but an unbounded read should never even be attempted.

**Wallet.** EIP-1193 via `window.ethereum`, surfaced through `WalletContext`. Reading never touches it. Account and chain changes are subscribed to, and a wrong network shows a persistent banner and blocks nothing except actions.

---

## 2. Routes

| Route | Purpose |
|---|---|
| `/` | What the project is, how a rule becomes canonical, what it does and does not prove, registry stats |
| `/protocols` | Registered namespaces, identity status, rule counts; namespace registration |
| `/protocol/:id` | Namespace facts, canonical rules, proposed topics (kept separate), propose a topic |
| `/rule/:id` | The core page: current commitment, version timeline, dispute banner, cases, open a claim or drift case |
| `/rule/:id/history` | Every version ever established, with lineage and fingerprints |
| `/case/:id` | Full lifecycle: claim, evidence, freeze, snapshots, verdicts, challenges, bond — plus every action valid at the current state |
| `/evidence/:id` | Source, retrieval method, anchors, snapshot status, fingerprint, frozen excerpt |
| `/verdict/:id` | Decision, per-dimension findings and reasoning, evidence used |
| `/challenge/:id` | Ground, argument, cited evidence, target and resulting verdict; resolve |
| `/account` | Connected wallet; honest about what it cannot show |
| `/status` | Contract address, network, read status, last refresh, config, economics, caps |
| `/methodology` | How evidence is frozen, how adjudication works, fingerprint schemes, limits |

Every route works with no wallet connected.

---

## 3. Contract methods integrated

**All 30 views** are wrapped in `lib/contract.ts`: `get_config`, `get_caps`, `get_counts`, `get_vocabularies`, `get_economic_config`, `get_protocol`, `list_protocols`, `get_rule`, `list_rules`, `get_current_rules`, `get_dispute_status`, `get_rule_version`, `list_rule_versions`, `get_current_rule_version`, `get_case`, `list_rule_cases`, `get_case_frozen_evidence`, `get_evidence`, `list_case_evidence`, `get_evidence_snapshot`, `list_case_snapshots`, `get_case_snapshot_status`, `get_case_snapshot_digest`, `get_verdict`, `list_case_verdicts`, `get_challenge`, `list_case_challenges`, `get_challenge_window`, `get_bond_state`, `list_case_bonds`.

**All 11 user-facing writes** have a wallet flow: `register_protocol`, `propose_rule`, `open_rule_claim`, `open_rule_drift`, `lock_bond` (payable), `submit_evidence`, `freeze_evidence`, `snapshot_evidence`, `request_adjudication`, `open_challenge`, `resolve_challenge`, `finalize_case`, `execute_payout`.

`set_paused` is deliberately not exposed: it is an owner-only emergency control, not a user action.

---

## 4. Consensus handling

This is the part most dapps get wrong, and the reason `writeFlow.ts` exists.

**A receipt is never treated as proof.** `classifyReceipt` maps the SDK's `TransactionStatus` — read from `genlayer-js`'s own type definitions, not guessed — onto four verdicts:

| Verdict | Statuses |
|---|---|
| `COMMITTED` | `ACCEPTED`, `FINALIZED` |
| `UNDETERMINED` | `UNDETERMINED`, `VALIDATORS_TIMEOUT`, `LEADER_TIMEOUT` |
| `FAILED` | `CANCELED` |
| `PENDING` | `PENDING`, `PROPOSING`, `COMMITTING`, `REVEALING`, `APPEAL_*`, `READY_TO_FINALIZE`, `UNINITIALIZED` |

`COMMITTED` is a short allowlist. **Anything unrecognised — a missing status, a new status, a numeric one — is `UNDETERMINED`, never committed.** If we cannot tell what happened, we must not tell the user it worked.

### The write pipeline

```
IDLE
 -> AWAITING_SIGNATURE
 -> SUBMITTED
 -> PROCESSING
 -> CONSENSUS_CHECK       classify the receipt
 -> STATE_REVALIDATING    re-read authoritative contract state
 -> SUCCESS               only if the contract confirms the change

failure branches: FAILED | UNDETERMINED | STATE_MISMATCH
```

Two properties matter most:

1. **Committed is still not success.** After a committed receipt the flow re-reads contract state and asks whether the intended transition actually happened. A `verify` function is required on every write — without one the flow reports `STATE_MISMATCH` rather than guessing. Examples: `lock_bond` verifies the bond reads `LOCKED`; `finalize_case` verifies the case is terminal *and*, if `FINALIZED`, that the rule now has a canonical version.
2. **Undetermined is its own outcome.** It is never collapsed into success or failure. The UI says the change was almost certainly not applied, that nothing was lost, and that the safe move is to reload and check before retrying. A receipt timeout is treated the same way — a timeout tells us nothing about whether the change applied.

`useWriteFlow` is the only path to `writeContract`. No component calls the SDK directly, so no screen can skip the consensus check or the re-read.

---

## 5. Security UX

| Requirement | How |
|---|---|
| No submitting after freeze | Action panels are gated on live case status; the contract rejects it regardless |
| No stale data shown as current | No cache. `useRead` derives `loading` by comparing the settled result's key against the current one, so data from a previous key can never render as current |
| No failed transaction shown as successful | Only `SUCCESS` renders as confirmed, and only after a state re-read |
| Consensus uncertainty never hidden | `UNDETERMINED` and `STATE_MISMATCH` are distinct, visible outcomes with their own explanations |
| Unconfigured is not empty | With no contract address, every read surface says so explicitly instead of rendering an empty list |
| Identity never overstated | The community disclaimer is a component on every protocol surface; protocol views show `officially_verified: false` |
| Evidence never framed as proof | Evidence pages say "submitted evidence"; excerpts are labelled untrusted external content and styled distinctly |

---

## 6. Testing

**39 tests, 5 files, all passing.**

- `consensus.test.ts` (8) — every status maps correctly; unknown, missing and numeric statuses are never committed; case-insensitivity.
- `writeFlow.test.ts` (9) — success only after verification; undetermined never verifies; canceled is failed; state mismatch on both a false verifier and a throwing one; receipt timeout is undetermined; wallet rejection is failed; unknown receipt shape is never success.
- `reads.test.ts` (7) — page limits clamped before leaving the browser; error codes surfaced (`RULE_NOT_FOUND`, `CASE_NOT_FOUND`, generic fallback); empty results; pagination passthrough.
- `ui.test.tsx` (10, jsdom) — unconfigured vs empty vs error vs loading vs data; disclaimer present; pagination edges.
- `format.test.ts` (5) — 18-decimal GEN rendering without floating point; hashes; UTC timestamps.

### Two harness notes

`vitest.config` sets `environment: "node"` by default and component tests opt into jsdom with a docblock. Spinning up jsdom for every worker exceeded Vitest's **hard-coded 60s worker-start timeout** on Windows; the switch took the suite from timing out to ~13s.

`reads.test.ts` has no `beforeEach(mockReset)`. With it, Vitest 4 re-surfaces a mock's recorded error as a test failure even when the code under test caught and wrapped it — verified by logging the caught error, which was the correct `ContractReadError` with the right code while the test still failed. Each test sets its own implementation instead.

---

## 7. Build validation

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean, strict mode with `noUncheckedIndexedAccess` |
| `eslint src --max-warnings 0` | clean |
| `vitest run` | 39 passed |
| `vite build` | 500 modules, 822 kB (201 kB gzip) |

TypeScript is pinned to 5.9: npm resolved `typescript@7` as latest, which `typescript-eslint` does not yet support, so linting was impossible until it was pinned.

---

## 8. Known limitations

1. **No contract address exists yet**, so the app has never read real data. Every screen was exercised against the typed layer and its states, not against a live registry. This is the largest gap and closes the moment a contract is deployed.
2. **The account page cannot list your activity.** The contract has no per-address index, and building one in the browser would mean scanning every case — the unbounded read the architecture forbids. The page says this plainly rather than faking it.
3. **822 kB bundle** (201 kB gzipped), almost entirely `genlayer-js` and its viem dependency. Code splitting would help and was not done.
4. **No live consensus testing.** `UNDETERMINED` handling is unit-tested against every status the SDK defines, but has never been exercised against a real validator disagreement.
5. **Evidence submission takes anchors as comma-separated text.** Functional, unpolished.
6. **No optimistic UI anywhere** — deliberately. Every action waits for the full pipeline, which is slower and more honest.
7. **Wallet support is EIP-1193 only.** No WalletConnect.
8. **Snapshot retrieval is one button per evidence item.** A case with eight sources needs eight transactions, which mirrors the contract but is tedious.
9. **No end-to-end tests.** They would need a deployed contract and a funded wallet.

---

## 9. Manual verification

```bash
cd frontend
npm install
cp .env.example .env       # set VITE_CONTRACT_ADDRESS once deployed
npm run typecheck && npm run lint && npm test && npm run build
npm run dev                # http://localhost:5173
```

**Without a contract address** every page loads and each read surface reports "No contract address configured" — deliberately distinct from an empty registry.

**With one**, walk: `/protocols` → a protocol → a rule → its history → the originating case → an evidence item → its verdict. All of it without connecting a wallet.

To exercise the write pipeline, connect a wallet on the configured chain and register a namespace. Watch the six pipeline steps; confirm nothing reports success until **Verifying on-chain state** completes.
