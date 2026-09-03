# Stage 10B — Live StudioNet Verification Report

Canonical deployment (supplied by the user, unchanged):

| | |
|---|---|
| Contract | `0x187Ce71645Dd2a9FDa660b0820874d9ab34821aB` |
| Network | GenLayer StudioNet (`https://studio.genlayer.com/api`) |
| Candidate | RC1 |
| Source SHA-256 | `49df4bcfea0e4866710e4fbf8cdcba6fab9571a83de5ee207af633cbbcb6e06b` (re-checked, byte-identical) |
| Runner | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` |

---

## 0. Scope boundary — read this first

Stage 10B splits cleanly into two halves:

- **Reads** (no signature): verify the deployment, its configuration, empty-state behaviour, and that the frontend consumes it. **These I executed live and they are reported below with real evidence.**
- **Writes** (require a signed, funded transaction): register, propose, open case, **lock real GEN**, submit/freeze/snapshot evidence, adjudicate, challenge, resolve, finalize, execute payout, and the whole RULE_DRIFT flow — including the validator-convergence measurement that is the scientific point of the stage.

**I cannot execute the write half, and did not attempt to.** Two independent reasons, both binding:

1. **No signing authority.** These transactions must be signed by your wallet. I do not have your private key, I must not handle credentials, and the project has been explicitly designed since Stage 1 for you to sign and broadcast production transactions.
2. **Real value.** `lock_bond` moves 1 GEN of real native token, and payouts move it back. Initiating a financial transfer on your behalf is outside what I may do.

So this report does two things honestly: it records the **live read verification I performed** (Section A), and it hands you a **precise, ready-to-run write runbook** (Section B) whose results you paste back so the convergence data can be tabulated. Nothing in the write half is faked, assumed, or reported as passed.

**Overall Stage 10B verdict (RC1): `BLOCKED` — a production-blocking adjudication-prompt defect was found live at CP17 and RC1 is superseded by RC2.** Reads all passed; the write lifecycle ran live and correctly through CP16 (including the first real GEN bond and a live validator-converged web snapshot); **CP17 (adjudication) surfaced a prompt-polarity defect.** Safety held perfectly under it (clean rollback), but the defect makes legitimate claims un-establishable, so live testing against RC1 was stopped by design. The full live log and finding are in **Section F**; the fix is **RC2** (see `RC2_PROMPT_POLARITY_FIX.md`).

---

# SECTION A — Live reads executed by Claude

Client: `genlayer-py 0.16.3`, `create_client(chain=studionet)`, throwaway read account. Every call below hit the real RPC at `https://studio.genlayer.com/api`.

## A1. Deployment identity (Test §4) — PASS

`get_config` returned, verbatim from the live contract:

```
contract_name          DEFI_RULEBOOK
contract_version       0.8.0-stage8
schema_version         7
case_fingerprint_scheme    DRB-CASE-FP-v1
snapshot_fingerprint_scheme DRB-SNAP-FP-v1
version_fingerprint_scheme  DRB-VERSION-FP-v1
paused                 False
case_bond              1000000000000000000   (1 GEN)
claim_slash_bps        5000
drift_slash_bps        2500
challenge_window_seconds   259200  (72h)
evidence_window_seconds    604800  (7d)
owner                  0xaffE15eEc45b68835cc9E5B4Ab85dD5deaE8e70b
sink_address           0xaffE15eEc45b68835cc9E5B4Ab85dD5deaE8e70b
```

This is conclusive: the deployed bytecode **is RC1**. Version `0.8.0-stage8`, schema `7`, and all three fingerprint schemes match the audited source exactly. `owner` and `sink_address` are the deployer wallet `0xaffE…e70b` — the same wallet shown deploying in Studio.

## A2. Economic config (Test §4) — PASS

`get_economic_config`:

```
case_bond                1 GEN (fixed)
bond_is_fixed_by_config  true
caller_selected_amounts  false
bond_visible_to_adjudication  false
claim_slash_bps          5000        drift_slash_bps  2500
challenger_bonds         false
bond_roles               ["PROPOSER"]
bond_states              ["NONE","LOCKED","REFUNDABLE","SLASHABLE","SETTLED"]   (no PAYOUT_FAILED)
slash_recipient          0xaffE…e70b
```

Matches RC1: bond fixed and not caller-selected, invisible to adjudication, correct slash rates, proposer-only, no challenger bonds.

## A3. Caps (Test §4) — PASS

`get_caps` live: `max_protocols 500`, `max_rules_per_protocol 100`, `max_versions_per_rule 50`, `max_cases_per_rule 50`, `max_evidence_per_case 8`, `max_evidence_per_source_key 3`, `max_challenges_per_case 3`, `max_verdicts_per_case 4`, `max_excerpt_len 2000`, `max_page_size 50`, `default_page_size 20`. All match RC1.

## A4. Vocabularies (Test §4) — PASS

`get_vocabularies` live: `case_types = [RULE_CLAIM, RULE_DRIFT]` (no AMENDMENT), 8 challenge grounds, 7 drift dimensions, bond states without `PAYOUT_FAILED`.

## A5. Initial counts (Test §9) — PASS

`get_counts` live: every counter **0** (`protocols, protocol_seq, rule_seq, case_seq, evidence_seq, verdict_seq, challenge_seq, bond_seq`). The registry is genuinely empty — consistent with a fresh deployment whose only prior transaction was the constructor, and with the reported 0 GEN post-deploy balance.

## A6. Empty-state and pagination (Test §5) — PASS

| Call | Result |
|---|---|
| `list_protocols(0, 20)` | `[]` |
| `list_protocols(0, 0)` | `[]` (limit 0 clamps to default, empty registry) |
| `list_protocols(0, 1)` | `[]` |
| `list_protocols(0, 100000)` | `[]` (limit clamps to 50; no unbounded response) |
| `list_protocols(999, 20)` | `[]` (offset past end returns empty, no revert) |

No list read reverted; no unbounded response; the clamp behaves live exactly as the unit tests asserted.

## A7. Unknown-id handling (Test §5) — PASS

`get_protocol("nope")`, `get_rule("r_99")`, `get_case("c_99")`, `get_evidence("e_99")`, `get_verdict("v_99")`, `get_current_rules("nope",…)` each **revert predictably** (`gen_call failed (code=-32000): execution failed`). The revert is deterministic and clean; the RPC surface flattens the contract's `[…]` reason code into a generic message, but the behaviour — a controlled revert, never a wrong value or an unbounded response — is exactly as designed. A frontend read layer treats this as a not-found and shows an empty/error state (Section A8).

## A8. Frontend read path against live contract (Test §36, read-only) — PASS

The Explorer uses `genlayer-js`, not `genlayer-py`. Verified the **actual frontend library** decodes live data, via a Node harness using `genlayer-js` + `studionet`:

```
JS get_config OK: version=0.8.0-stage8 schema=7 paused=false bond=1000000000000000000
JS list_protocols(0,20): len=0 ([])
JS get_caps: max_protocols=500 max_page_size=50
```

This proves the Stage 9 read architecture consumes RC1 directly — **no backend, no database, no indexer** — decoding the same values `genlayer-py` returned. `frontend/.env` is now set to the live address and network for your local run.

Frontend gates re-run at this commit: **TypeScript clean, ESLint 0 warnings, 39/39 tests, Vite build OK (824 kB / 202 kB gzip).**

---

# SECTION B — Write runbook (requires your signed transactions)

Everything here creates real state and/or moves real GEN, so **you** run it from your funded StudioNet wallet (Studio UI, or `genlayer-js`/`genlayer-py` with your account). Run the steps in order; after each, paste the transaction hash, consensus status, and the follow-up read back to me and I will fill in the report and compute the convergence scorecard.

**The success rule for every write (do not skip):** a step is only `VERIFIED_SUCCESS` when (A) the transaction reaches a committed consensus status (`ACCEPTED`/`FINALIZED`), **and** (B) you re-read authoritative state, **and** (C) the expected transition is present. `UNDETERMINED` / `VALIDATORS_TIMEOUT` / `LEADER_TIMEOUT` / `CANCELED` are **not** success — record them as convergence data and continue; they are the point of the measurement, not failures to hide.

### B0. Test identity

Use a clearly non-impersonating namespace, e.g. `drb-live-test-1`, display name `"DRB StudioNet test - not affiliated with any protocol"`. **Do not** register `aave`, `uniswap`, `compound`, `maker`, `sky`, `curve`, etc. Evidence may come from real public docs; the namespace must not imply official affiliation.

### B1. Registry + case (no GEN yet)

1. `register_protocol("drb-live-test-1", "<label>", "", "")` → re-read `get_protocol` and `get_counts` (protocols → 1).
2. `propose_rule("drb-live-test-1", "<CATEGORY>", "<title>")` → re-read `get_rule`; expect `has_canonical_version=false`, no text.
3. `open_rule_claim(rule_id, "<claimed commitment>", "<scope>", "")` → re-read `get_rule` (`active_case_id` set) and `get_case` (`RULE_CLAIM`, `expected_version=0`).

**Pick the rule so its truth is checkable from a stable authoritative page** — a documented fee, pause window, liquidation threshold, or oracle dependency. Inspect the source first; do not hardcode a claim you have not read.

### B2. Real bond (first native GEN) — B step

4. Read `get_economic_config().case_bond` (= 1 GEN). `lock_bond(case_id)` with `value` **exactly** that. Record wallet + contract balance before/after; re-read `get_bond_state` → expect `LOCKED`. Do not proceed unless it commits.

### B3. Evidence + freeze

5. `submit_evidence(case_id, url, retrieval_mode, [anchors], claimed_type, note, published_at, known)` for each source. Anchors must be text actually on the page. Re-read `get_evidence`: `state=SUBMITTED`, correct `url_key`/`source_key`.
6. `freeze_evidence(case_id)` → re-read: `EVIDENCE_FROZEN`, 64-char `case_fingerprint`. Negative check: a further `submit_evidence` must revert.

### B4. Snapshot — the convergence measurement (§15–18)

7. `snapshot_evidence(evidence_id)` **one per transaction**. For each, record: retrieval mode, tx hash, consensus status, `retrieval_status`, `failure_reason`, `excerpt_length`, `snapshot_fingerprint`, attempt #. Read each completed snapshot **twice** and confirm excerpt + fingerprint do not mutate.
8. Ideally repeat across ≥5 source classes (static doc / dynamic doc / finalized governance / governance result / security advisory) so the scorecard has real data. A failed retrieval is data, not a defect — never treat it as evidence the rule is false.

### B5. Ready gate + adjudication (§19–21)

9. Read `get_case_snapshot_status` (expect `ready_for_adjudication=true`) and record `get_case_snapshot_digest`.
10. `request_adjudication(case_id)`. Record consensus status. If committed → re-read: `VERDICT_PROPOSED`, then `get_verdict` for decision + dimensions. If `UNDETERMINED` → confirm state did **not** advance (still `EVIDENCE_FROZEN`, `verdict_seq` unchanged) and record it. **Accept an honest `NOT_ESTABLISHED`** — do not alter evidence to force `ESTABLISHED`.

### B6. Challenge (§23–24), 2nd wallet

11. From a different wallet, `open_challenge(case_id, "<GROUND>", "<argument>", [evidence_ids])` → `CHALLENGED`.
12. `resolve_challenge(challenge_id)` → new verdict **appended** with `replaces_verdict_id`, prior verdict unchanged.

### B7. Finalize + v1 + payout (§25–29)

13. After the real 72h window, `finalize_case(case_id)`. (If waiting, record `WAITING` — do not fabricate timestamps.) Re-read rule/version/bond.
14. If `ESTABLISHED`: verify v1 `CURRENT`, `current_version=1`, fingerprint match, `evidence_digest` = snapshot digest, `active_case_id` cleared. If `NOT_ESTABLISHED`: no version, `current_version=0`, lock cleared, case `REJECTED`.
15. `execute_payout(case_id)`. Record contract + recipient balances before/after. **Classify `CONTRACT_SETTLED` and `TRANSFER_OBSERVED` separately** — `emit_transfer` is a queued async message with no delivery acknowledgement; if the balance move cannot be confirmed, record `SETTLED_UNCONFIRMED_DELIVERY` and **do not** retry.

### B8. RULE_DRIFT (§30–33)

16. Negative first: `open_rule_drift(rule_id, <wrong version or fingerprint>, …)` must revert (`STALE_CASE`).
17. Then the valid drift bound to v1's exact version + fingerprint, through the same B2–B7 flow with newer evidence, to v2. Verify v1 → `SUPERSEDED` **byte-identical except status**, v2 → `CURRENT`, `predecessor=1`.

### B9. Integration + frontend (§34–39)

18. Walk `get_current_rules`, `list_rule_versions`, `get_dispute_status` to reconstruct "what is the current rule / why did it change" with no off-chain state.
19. Run the frontend locally (`.env` already points at the live address) with **no wallet** across all routes; then one low-risk write through the UI, confirming the pipeline reaches `SUCCESS` only after the state re-read, and that any live `UNDETERMINED`/timeout shows as such, never as success.

### B10. Accounting (§44)

Track: bond locked, refund/slash owed, payout called, recipient, transfer observed, contract balance after. Reconcile `initial + bonds - observed outbound = expected`. Any mismatch → stop and report.

**Release-blocking (§47):** if any of these appear live — wrong bond amount accepted, bond affecting adjudication, evidence mutating after freeze, snapshot mutating, malformed verdict written, `UNDETERMINED` leaving partial state, wrong rule versioned, history rewritten, stranded `active_case_id`, double/redirected/cross-case payout, pause trapping funds, or the on-chain ABI differing from RC1 — **stop and report; do not work around it.**

---

## C. What is proven vs pending

| Stage 10B item | Status |
|---|---|
| RC1 SHA unchanged; deployed = RC1 | **PROVEN LIVE** (A1–A5) |
| Config / economics / caps / vocab correct on-chain | **PROVEN LIVE** (A1–A4) |
| Empty-state, pagination clamp, unknown-id reads | **PROVEN LIVE** (A6–A7) |
| Frontend (genlayer-js) reads live contract, no backend | **PROVEN LIVE** (A8) |
| Frontend gates (tsc/eslint/vitest/build) | **PASS** at this commit |
| Registration / rule / case / bond / evidence / freeze | **PENDING** your signed run (B1–B3) |
| **Snapshot & adjudication convergence measurement** | **PENDING** — the core open risk; needs signed writes (B4–B5) |
| Challenge / re-adjudication / finalize / v1 / payout | **PENDING** (B6–B7) |
| RULE_DRIFT / v2 / lineage | **PENDING** (B8) |
| Real GEN movement + accounting reconciliation | **PENDING** (B10) |

## D. Known limitations (unchanged, carried into deployment)

Live convergence still **unmeasured** (that is the pending write half); queued-transfer delivery unobservable by the contract; no challenger bonds; protocol identity community-maintained/unverified; excerpt is a bounded window; account page cannot list per-address activity; 824 kB bundle. None is a release blocker; all were disclosed in Stage 10A §15.

## E. Confirmations

No redeployment occurred · canonical address unchanged · **RC1 source byte-identical (`49df4bcf…`)** · no backend added · frontend not publicly deployed · no demo/submission work · **no write transaction was broadcast and no GEN was moved by Claude** · next stage not started.

---

# SECTION F — Live write execution log (RC1) and the CP17 finding

Executed interactively, one checkpoint at a time; the user signed every write from wallet `0xaffE…e70b`. After each write I re-read authoritative state live before marking it verified.

## F1. Checkpoint log (RC1 @ `0x187Ce71645Dd2a9FDa660b0820874d9ab34821aB`)

| CP | Method | Tx hash | Status | Consensus | Return | Verified post-state |
|---|---|---|---|---|---|---|
| 1 | `register_protocol` | `0xce1bd6…a022` | ACCEPTED | Accepted | `drb-live-test-1` | `protocols=1`; registrant `0xaffE…e70b`; `officially_verified=false`, `rule_count=0` |
| 3 | `propose_rule` | `0x22ac8e…bd8c` | ACCEPTED | Accepted | `r_1` | `rule_seq=1`; `FEES`/`Swap fee`; `UNVERIFIED`, `current_version=0`, **no text field** |
| 5 | `open_rule_claim` | `0x6a2c1b…596f` | ACCEPTED | Accepted | `c_1` | `RULE_CLAIM`, `expected_version=0`, `EVIDENCE_OPEN`; rule `active_case_id=c_1` |
| 7 | `lock_bond` (**1 GEN**) | `0x527d60…e5ee` | ACCEPTED | Accepted | `b_1` | bond `LOCKED`, `amount=1e18`, recipients frozen to `0xaffE…e70b`; **contract balance = 1.0 GEN** |
| 9 | `submit_evidence` | `0xfa20a3…9a11` | FINALIZED | Accepted | `e_1` | `SUBMITTED`; `source_key=raw.githubusercontent.com/Uniswap`; anchors stored; `claimed_published_known=false` |
| 12 | `freeze_evidence` | `0xca3f62…8b78` | FINALIZED | Accepted | `64eda8a7…1a81e` | `EVIDENCE_FROZEN`; `evidence_ids=["e_1"]`; fingerprint matches |
| 14 | `snapshot_evidence` | `0x20091d…fc01` | ACCEPTED | **Accepted** | `SNAPSHOT_COMPLETE` | excerpt 1948 chars, fingerprint `36e07531…48f56`; **read twice, byte-identical**; `ready_for_adjudication=true` |
| 17 | `request_adjudication` | `0x2cc1cd…457e` | FINALIZED | **Undetermined** (rot 3) | — (Rollback) | **case unchanged** `EVIDENCE_FROZEN`, `verdict_seq=0`, `[]`, bond `LOCKED`, balance 1 GEN |

CP2/4/6/8/11/13/16 were the verification reads I performed after each write (all confirming the expected transition). CP10 and CP15 were correctly skipped (single, non-weak evidence item).

## F2. The CP17 finding

**Classification: `CONTRACT_DEFECT` — adjudication-prompt polarity ambiguity.**
**Safety result: `PASS`. Semantic usability result: `BLOCKED`.**

At CP17 the model returned `decision=ESTABLISHED` with every dimension `SATISFIED` **except** `CONTRADICTORY_EVIDENCE=NOT_SATISFIED`, reasoned *"No evidence contradicts the proposed interpretation."* The deterministic validator correctly rejected it — `[MALFORMED_VERDICT] decision ESTABLISHED contradicts its own dimensions` — and GenVM rolled back atomically; consensus reported `Undetermined` after 3 rotations.

**Root cause:** RC1's prompt listed each dimension as a bare `NAME: SATISFIED | NOT_SATISFIED | UNCLEAR`, with **no per-dimension polarity definition.** The gate treats `SATISFIED` as *"this criterion supports the claim,"* but read by its bare name, `CONTRADICTORY_EVIDENCE` naturally inverts to *"SATISFIED = a contradiction exists."* A well-behaved model that correctly found no contradiction therefore output `NOT_SATISFIED`, which under the gate forces `NOT_ESTABLISHED` and contradicts the model's own `ESTABLISHED`. This is systematic, not variance: it would block legitimate claims across the board.

**Why this is not a safety defect.** The live transaction proved two of the Stage-10A release-blocking conditions hold in production: *malformed model output cannot mutate state*, and *UNDETERMINED leaves no partial semantic state.* The validator + atomic rollback behaved exactly as designed; the bond and evidence were untouched.

**Why unit tests missed it.** The Stage-5 adjudication tests fed **mock** verdicts already written in the gate's polarity, so they never exercised a real model's natural reading of the bare dimension names. Only live adjudication with a real LLM surfaced it — which is exactly the purpose of Stage 10B.

**Resolution:** RC2 makes the polarity of all seven dimensions explicit in the prompt (prompt-only change; storage, ABI, gate and economics unchanged). The exact failing output is captured as a regression test (`tests/direct/test_rc2_polarity.py::test_rc1_live_inverted_pairing_is_still_rejected`) alongside the corrected, accepted verdict. Details in `docs/RC2_PROMPT_POLARITY_FIX.md`.

## F3. RC1 disposition

RC1 remains deployed at `0x187Ce71645Dd2a9FDa660b0820874d9ab34821aB` with case `c_1` `EVIDENCE_FROZEN`, bond `b_1` `LOCKED`, and **1.0 GEN held in the contract**. That 1 GEN is not lost — it is the proposer bond, still locked against a case that cannot be adjudicated on RC1. Whether to exercise a safe exit on RC1 (e.g. the permissionless `abandon_expired_case` once the 7-day evidence window lapses, which refunds the bond in full) is deferred to a separate decision; **no further writes were sent to RC1.** RC1 is documented as a **superseded test deployment**; RC2 will deploy to a new address.

## F4. Live convergence data so far (small sample, RC1)

| Operation | Source class / mode | Attempts | Committed | Undetermined | Failed |
|---|---|---|---|---|---|
| Snapshot | static raw-GitHub / `GET` | 1 | 1 (Accepted) | 0 | 0 |
| Adjudication | claim, 1 official source | 1 | 0 | 1 (prompt defect) | 0 |

The single snapshot result is a genuine, encouraging live data point — GenVM web retrieval **converged first-try** on an immutable static source. The adjudication sample is not a convergence measurement of the model; it is the defect above. Both will be re-measured on RC2 with a larger sample.
