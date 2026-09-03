# DEFI RULEBOOK — RC3: Adjudication Decision-Derivation Fix

Narrowly scoped production fix for the second CONTRACT_DEFECT found live in Stage 10B (RC2). **Prompt clarity only** — storage, schema, ABI, economics, evidence handling, challenges, versioning, bonds, payout, pause, and the deterministic decision gate / validator / equivalence semantics are all unchanged. The model `decision` field is retained; the validator's cross-check is retained.

| | RC2 | RC3 |
|---|---|---|
| SHA-256 | `8fc62f6be8cf4d278d1da62352abc3d287b237a0e279f6f9709fca0fcbcb7d53` | `29307e7e8b94b8abd5239d184f41d7ec61f5ef03ccc8813b2eb7ecbe76ec7de6` |
| Lines / bytes | 3,230 / 127,667 | 3,276 / 129,968 |
| `contract_version` | `0.9.0-rc2` | `0.10.0-rc3` |
| `schema_version` | `7` | **`7` (unchanged)** |
| ABI | 46 (16 write / 30 view / `lock_bond` payable) | **identical** |
| Runner pin | `py-genlayer:1jb45aa8…09h6` | **unchanged** |

---

## 1. The observed live failure (RC2 CP21-retry)

RC2 tx `0x9dd0ea65f8e7…22bb`, `resolve_challenge(ch_1)`: consensus `Accepted`, GenVM `Rollback`, `[MALFORMED_VERDICT] decision NOT_ESTABLISHED contradicts its own dimensions`. Leader verdict:

```
SOURCE_AUTHORITY=SATISFIED  SOURCE_INDEPENDENCE=SATISFIED  GOVERNANCE_LEGITIMACY=SATISFIED
TEMPORAL_VALIDITY=UNCLEAR   CLAIM_SUPPORT=SATISFIED        CONTRADICTORY_EVIDENCE=SATISFIED
decision=NOT_ESTABLISHED    reason: "TEMPORAL_VALIDITY is UNCLEAR, ... sufficient to prevent ESTABLISHED."
```

Dimensions are correctly polarised (the RC2 fix is intact). But the model chose `NOT_ESTABLISHED`, while the gate derives `ESTABLISHED` for a RULE_CLAIM with `TEMPORAL_VALIDITY=UNCLEAR`. At CP17 the same case happened to pick `ESTABLISHED` (matching); the inconsistency shows the decision rule was underspecified to the model. Both attempts rolled back cleanly (authoritative state unchanged).

## 2. Source-derived decision gate (authoritative)

Extracted directly from `_gate_decision` in the current source — this, not any paraphrase, is authoritative.

**Common to both case types — all must hold, else `NOT_ESTABLISHED`:**
- `SOURCE_AUTHORITY == SATISFIED` (UNCLEAR or NOT_SATISFIED blocks)
- `CLAIM_SUPPORT == SATISFIED`
- `CONTRADICTORY_EVIDENCE == SATISFIED`
- `GOVERNANCE_LEGITIMACY != NOT_SATISFIED` (SATISFIED or UNCLEAR pass)
- `SOURCE_INDEPENDENCE != NOT_SATISFIED` (SATISFIED or UNCLEAR pass)
- at least one included evidence item has `claimed_type` **not** in {`GOVERNANCE_PROPOSAL`, `THIRD_PARTY_ANALYSIS`}

**RULE_CLAIM:** `TEMPORAL_VALIDITY` ∈ {SATISFIED, UNCLEAR} (only NOT_SATISFIED blocks). `EXISTING_RULE_CONSISTENCY` is not evaluated.

**RULE_DRIFT:** `TEMPORAL_VALIDITY == SATISFIED` **and** `EXISTING_RULE_CONSISTENCY == SATISFIED` (UNCLEAR or NOT_SATISFIED on either blocks).

If all applicable conditions hold → `ESTABLISHED`; otherwise `NOT_ESTABLISHED`.

This matches the Stage-1 design and the RC3 brief §4/§5 — no material divergence — so the fix proceeded. (It also confirmed a third mismatch source the prompt must state: the weak-evidence-type condition.)

## 3. The change (exact)

A `DECISION DERIVATION` block added to `_build_prompt`, immediately before `OUTPUT`, plus the `contract_version` bump. Nothing else.

1. **Reasoning order + authority:** "The decision is NOT a separate subjective judgement. Assign every dimension first, then derive the decision MECHANICALLY from those results… The contract recomputes the same decision and rejects any verdict whose decision does not match, so do not choose a decision first and fit dimensions to it."

2. **Common establishment conditions**, verbatim to the gate: `SOURCE_AUTHORITY` SATISFIED; `CLAIM_SUPPORT` SATISFIED; `CONTRADICTORY_EVIDENCE` SATISFIED; `GOVERNANCE_LEGITIMACY` not NOT_SATISFIED; `SOURCE_INDEPENDENCE` not NOT_SATISFIED; and ≥1 evidence item whose `claimed_type` is other than `GOVERNANCE_PROPOSAL`/`THIRD_PARTY_ANALYSIS`.

3. **Case-type branch** (emitted per `case.case_type`):
   - **RULE_CLAIM:** "TEMPORAL_VALIDITY may be SATISFIED or UNCLEAR — only NOT_SATISFIED blocks it. Do NOT lower the decision to NOT_ESTABLISHED merely because TEMPORAL_VALIDITY is UNCLEAR," plus a worked example (all strong SATISFIED, temporal UNCLEAR, non-weak source → **MUST be ESTABLISHED**) — directly reproducing the failed case's correct answer.
   - **RULE_DRIFT:** "TEMPORAL_VALIDITY must be SATISFIED and EXISTING_RULE_CONSISTENCY must be SATISFIED; if either is UNCLEAR or NOT_SATISFIED the decision is NOT_ESTABLISHED," plus the explicit contrast: "a claim may establish with TEMPORAL_VALIDITY UNCLEAR, but this drift may not."

4. The prior vague line ("Weak evidence is NOT_ESTABLISHED. Conflicting evidence is NOT_ESTABLISHED.") is replaced with "decision must be ESTABLISHED or NOT_ESTABLISHED, derived by the DECISION DERIVATION rules above."

## 4. What deliberately did NOT change

- **Deterministic gate / validator / equivalence** — byte-for-byte identical. RC3 teaches the model to *predict* the gate; it does not alter the gate. A mismatch still fails atomically.
- **Model `decision` field retained; validator cross-check retained.** The alternative (ignore the model's decision, use only the gate) was explicitly rejected — it would discard the cross-check that caught the RC1 polarity inversion (dimensions with an inverted `CONTRADICTORY_EVIDENCE` would otherwise commit a wrong verdict). Keeping the cross-check preserves that protection while RC3 removes the avoidable mismatch.
- **RC2 polarity fix preserved** — every `DIMENSION_POLARITY` definition is intact, including `CONTRADICTORY_EVIDENCE: SATISFIED = NO unresolved contradiction`. A regression test guards it.
- **Storage** — 9 records (8/12/14/28/22/5/12/12/14) + 36 top-level fields, verified identical.
- **ABI** — 46 methods, 16 write / 30 view, `lock_bond` only payable, no-parameter constructor, verified identical. Frontend unchanged; 39 tests still pass.

## 5. Tests

`tests/direct/test_rc3_decision.py` (24 tests):

- **Exact CP21-retry regression** — establishing dimensions + `TEMPORAL_VALIDITY=UNCLEAR` + model `NOT_ESTABLISHED` is still rejected `[MALFORMED_VERDICT]` with clean rollback; the same dimensions with `ESTABLISHED` now commit.
- **RULE_CLAIM truth table (11 cases)** — all-SATISFIED → ESTABLISHED; temporal/governance/independence UNCLEAR → ESTABLISHED; each blocking NOT_SATISFIED and `SOURCE_AUTHORITY=UNCLEAR` → NOT_ESTABLISHED; each fed with the gate-matching decision and asserted accepted.
- **Weak-evidence gate** — all-weak evidence with all-SATISFIED dimensions derives NOT_ESTABLISHED; a model `ESTABLISHED` there is rejected.
- **RULE_DRIFT truth table (6 cases)** — all-SATISFIED → ESTABLISHED; temporal UNCLEAR/NOT_SATISFIED and existing-rule-consistency UNCLEAR/NOT_SATISFIED → NOT_ESTABLISHED; plus the CLAIM-vs-DRIFT contrast (UNCLEAR temporal + ESTABLISHED is valid for a claim, malformed for a drift).
- **Prompt/gate consistency** — the built prompt names every gate-significant condition (the six common ones incl. the weak-evidence-type rule, the claim temporal rule, the drift stricter rule) and still contains the RC2 `CONTRADICTORY_EVIDENCE` polarity definition.

Full suite: **346 passed, 0 failed, 0 skipped.**

## 6. Prompt size impact

The `DECISION DERIVATION` block adds roughly **900–1000 characters (~230–260 tokens)** to a claim prompt at runtime (similar for a drift). The prompt was audited for contradictions between the polarity definitions, the decision derivation, the CLAIM/DRIFT framing and the output schema — none found; the derivation restates the same conditions the polarity section already defines, in decision terms. The goal was clarity, not verbosity.

## 7. Remaining risks

1. **Prompt clarity reduces but cannot eliminate model error or UNDETERMINED.** RC2 already showed one genuine validator-variance `Undetermined` on re-adjudication (a valid leader verdict that didn't reach consensus). RC3 does not change that possibility; it only removes the *decision-mismatch* class of malformed verdicts. Live re-measurement on RC3 is required.
2. **Two superseded deployments hold locked test funds** (RC1 and RC2, 1 GEN each). Tracked for separate cleanup; not touched here.
3. RC3 is a candidate until the Studio schema-load check and manual redeploy.
4. The natural `Undetermined` frequency on re-adjudication remains to be measured across a larger sample on RC3.
