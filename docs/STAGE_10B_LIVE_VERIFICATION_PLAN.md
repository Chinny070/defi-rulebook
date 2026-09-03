# Stage 10B — Live Verification Plan

**Prepared, not executed.** Nothing in this document has been run. It becomes actionable only after you deploy RC1 and provide the contract address, network and consensus confirmation.

Its purpose is to settle, with measurements rather than argument, the question open since Stage 1: **does GenLayer consensus actually converge on real web evidence, and how often does it not?**

---

## 0. Preconditions

- RC1 deployed by you; full contract address recorded
- Network recorded (expected: StudioNet)
- Deploy transaction reached a committed consensus status
- Deployer wallet funded with enough GEN for several 1 GEN bonds plus gas
- `frontend/.env` set to the deployed address and network

Every step records: transaction hash, **consensus status name**, resulting contract state read back, and whether the two agree. A step is only "passed" when the state read confirms it — a receipt alone never counts.

---

## A. Basic reads

Call `get_config`, `get_caps`, `get_vocabularies`, `get_counts`, `get_economic_config` against the live address.

Expect: contract version `0.8.0-stage8`, schema version `7`, `paused: false`, all counters zero, `case_bond` 1 GEN, claim slash 5000 bps, drift slash 2500 bps, `bond_visible_to_adjudication: false`.

**Confirms:** the deployed bytecode is the audited source and the registry is genuinely empty.

## B. Protocol registration

Register **one clearly non-impersonating test namespace** (e.g. `rulebook-test-a`). Verify `get_protocol` returns it with `officially_verified: false`, and that the registrant gained no powers.

## C. Rule shell

`propose_rule` in an approved category. Verify `has_canonical_version: false`, no text field, and that `get_current_rules` still returns `[]`.

## D. RULE_CLAIM

Open a claim with a modest, checkable commitment. Verify the rule's `active_case_id` is set and a second claim is refused with `[ACTIVE_CASE_EXISTS]`.

## E. Real native GEN bond

**The first real-money step.** `lock_bond` with exactly 1 GEN.

Verify: the transaction commits; `get_bond_state` reads `LOCKED`; **the contract's balance increased by exactly 1 GEN**; and a wrong amount is refused. Record the gas cost.

## F. Evidence submission

Submit 2–3 sources with anchors chosen from text actually present on each page. Verify normalization (`url_key`), `source_key` grouping, and that duplicates and the per-source cap are refused.

## G. Evidence freeze

`freeze_evidence`. Verify status `EVIDENCE_FROZEN`, the frozen id list, a 64-char case fingerprint, and that a later submission is refused.

## H. Live web snapshot — **the critical step**

`snapshot_evidence` per item, against real pages.

Record per attempt: consensus status, `retrieval_status`, `failure_reason`, `excerpt_length`, `snapshot_fingerprint`, attempts used.

## I. Convergence measurement

Run the snapshot step across **five source classes**, ideally more than once each:

| Class | What it stresses |
|---|---|
| Stable official documentation | the easy case; a baseline |
| Dynamic / JS-rendered documentation | `render` vs `get`, and the `2s` wait |
| Finalized governance decision page | governance-heavy layout, dated content |
| Governance proposal / result page | dynamic status widgets, vote counters |
| Security advisory | often static, often paginated |

For each, measure:

- snapshot transaction **consensus result** (and the exact status name on failure)
- retrieval success rate
- **excerpt stability** — identical bytes across repeated snapshots of the same URL
- **fingerprint stability** — the same hash across those repeats
- occurrence of `UNDETERMINED`, `VALIDATORS_TIMEOUT`, `LEADER_TIMEOUT`

**Decision rule.** If a class converges reliably, keep `strict_eq` over the anchor excerpt. If a class does not, do **not** loosen the excerpt to force agreement: first tighten the window, and only then consider the documented fallback (`run_nondet_unsafe` with a validator that re-retrieves and compares the anchor window under explicit tolerance). Record the measured rate either way. A class that cannot produce a stable excerpt is honestly unusable as frozen evidence.

## J. Live adjudication

`request_adjudication` on the frozen, snapshotted case.

Record: consensus status, the decision, every dimension result, and whether repeated runs on the same frozen inputs produce the same decision. Verify the stored verdict's `case_fingerprint` matches the case.

**Also measure the Undetermined rate here** — this is the second-most likely place for it, and unlike snapshotting it involves no retrieval at all.

## K. Challenge

From a **second wallet**, open a challenge naming one ground. Verify the reporter cannot self-challenge, that the case reads `CHALLENGED`, and that a second simultaneous challenge is refused.

## L. Re-adjudication

`resolve_challenge`. Verify a new verdict is **appended** with `replaces_verdict_id` set, the original verdict is unchanged, and the outcome is `UPHELD`/`REJECTED` consistent with the decisions.

## M. Finalization

Wait out the 72h window (or use a short-window redeploy for timing). Verify finalization is refused before expiry, refused while a challenge is open, and permissionless after.

## N. RuleVersion v1

Verify v1 exists with `status: CURRENT`, correct text, `predecessor: 0`, originating case and verdict, an `evidence_digest` equal to the live snapshot digest, and a 64-char fingerprint that equals the rule's `current_fingerprint`.

## O. Real GEN refund / slash

`execute_payout`.

Verify **actual balance movement**: for an established claim, the proposer's balance rises by 1 GEN and the contract's falls. Then run a deliberately weak claim to a `NOT_ESTABLISHED` finalization and verify the sink receives 0.5 GEN and the proposer 0.5 GEN. Repeat for a drift case: sink 0.25 GEN, proposer 0.75 GEN.

Then confirm a second `execute_payout` is refused, and **that the queued transfer actually landed** — check recipient balances, not the receipt. This is the one behaviour with no local proof.

## P. RULE_DRIFT

Open a drift case bound to v1's exact version and fingerprint. Verify a wrong fingerprint is refused and the rule reads `DISPUTED` with `active_drift_case: true`.

## Q. RuleVersion v2

Take the drift case through to finalization. Verify v2 is `CURRENT` with `predecessor: 1`.

## R. Lineage verification

Verify **v1 is byte-identical after supersession** except its status: same text, fingerprint, originating case, verdict, evidence digest, effective basis and timestamp. Walk the full chain: protocol → rule → v2 → originating case → evidence → snapshot → verdict → challenge → bond.

## S. Frontend reads against the deployed address

Point `frontend/.env` at the live contract. Walk every route with **no wallet connected** and confirm each renders live data, that unverified topics never appear in the canonical feed, and that no page shows an empty list where a read actually failed.

## T. Frontend write-state revalidation

Perform one write of each kind through the UI. Confirm every one shows the full pipeline and reaches `SUCCESS` **only after** the state re-read.

Then force the unhappy paths: reject a signature in the wallet (expect `FAILED`), and if any live transaction returns `UNDETERMINED`, `CANCELED`, `VALIDATORS_TIMEOUT` or `LEADER_TIMEOUT`, confirm the UI reports it as that distinct outcome and **never** as success.

---

## Reporting

Stage 10B produces `docs/STAGE_10B_LIVE_VERIFICATION_RESULTS.md` containing the deployed address and network, a per-step pass/fail with transaction hashes and consensus statuses, the **convergence table** (per source class: retrieval success, excerpt stability, fingerprint stability, Undetermined rate), measured gas and GEN movements, any defect found, and an explicit statement of what remains unproven.

**Nothing in Stage 10B may claim convergence is proven from Stage 10A evidence.** If a measurement is not taken, it is reported as not taken.

---

## Explicitly out of scope for 10B

Seeding a real protocol's Rulebook (test namespaces only until convergence is understood), fabricating "official" commitments, public frontend deployment, demo or submission material.
