# DEFI RULEBOOK — RC2: Adjudication Prompt Polarity Fix

Narrowly scoped production fix for the CONTRACT_DEFECT found live in Stage 10B. **Prompt clarity only** — storage, ABI, the deterministic gate, economics, challenges, versioning and evidence retrieval are all unchanged.

| | RC1 | RC2 |
|---|---|---|
| Path | `contracts/defi_rulebook.py` | `contracts/defi_rulebook.py` |
| SHA-256 | `49df4bcfea0e4866710e4fbf8cdcba6fab9571a83de5ee207af633cbbcb6e06b` | `8fc62f6be8cf4d278d1da62352abc3d287b237a0e279f6f9709fca0fcbcb7d53` |
| Lines / bytes | 3,135 / 122,482 | 3,230 / 127,667 |
| `contract_version` | `0.8.0-stage8` | `0.9.0-rc2` |
| `schema_version` | `7` | **`7` (unchanged)** |
| ABI | 46 (16 write / 30 view / `lock_bond` payable) | **identical** |
| Runner pin | `py-genlayer:1jb45aa8…09h6` | **unchanged** |

---

## 1. The observed live failure

Stage 10B CP17, StudioNet tx `0x2cc1cdde…457e`: `request_adjudication(c_1)` on a claim backed by official Uniswap docs stating a 0.3% fee. The model returned:

```
decision = ESTABLISHED
SOURCE_AUTHORITY        SATISFIED
SOURCE_INDEPENDENCE     SATISFIED
GOVERNANCE_LEGITIMACY   SATISFIED
TEMPORAL_VALIDITY       SATISFIED
CLAIM_SUPPORT           SATISFIED
CONTRADICTORY_EVIDENCE  NOT_SATISFIED   reason: "No evidence contradicts the proposed interpretation."
```

Consensus `Undetermined` (3 rotations); GenVM `ERROR / Rollback`; validator message `[MALFORMED_VERDICT] decision ESTABLISHED contradicts its own dimensions`. State was fully preserved (case `EVIDENCE_FROZEN`, no verdict, bond `LOCKED`, 1 GEN held).

## 2. Root cause

RC1's `_build_prompt` listed each dimension as a bare enumeration:

```
- CONTRADICTORY_EVIDENCE: SATISFIED | NOT_SATISFIED | UNCLEAR
```

with **no definition of what SATISFIED means per dimension.** The deterministic gate uses one convention throughout: `SATISFIED` = *this criterion is met in a way that supports establishing the claim*. But read only by its name, `CONTRADICTORY_EVIDENCE` inverts naturally to *"SATISFIED = contradictory evidence exists."* A model that correctly found **no** contradiction therefore labelled it `NOT_SATISFIED` — the opposite of what the gate needs — and the gate, doing its job, turned that into `NOT_ESTABLISHED`, contradicting the model's own `ESTABLISHED`.

The defect is the prompt's ambiguity, **not** the validator. The validator behaved correctly and must not change.

## 3. The change (exact)

Three additions to `_build_prompt`, plus a `DIMENSION_POLARITY` constant and a `contract_version` bump. Nothing else.

1. **Global polarity rule**, before the dimension list:
   > For EVERY dimension: SATISFIED means the criterion is met in a way that SUPPORTS establishing the claimed commitment. NOT_SATISFIED means it materially weighs AGAINST establishing it. UNCLEAR means the frozen evidence does not permit a reliable determination. Do NOT read SATISFIED as merely meaning that the thing named by the dimension exists.

2. **Per-dimension definitions** — each dimension is now emitted as `NAME: SATISFIED = …; NOT_SATISFIED = …; UNCLEAR = …` from the new `DIMENSION_POLARITY` map, covering all seven dimensions. The `CONTRADICTORY_EVIDENCE` line reads: *"SATISFIED = NO unresolved frozen evidence materially contradicts the proposed interpretation; … Note the polarity: no contradiction means SATISFIED."*

3. **Worked example** mirroring the exact live failure:
   > Example (valid): CONTRADICTORY_EVIDENCE result SATISFIED, reason "No frozen evidence materially contradicts…". Example (INVALID — do not do this): CONTRADICTORY_EVIDENCE result NOT_SATISFIED with reason "No evidence contradicts the claim" — that reason describes SATISFIED, so the result must be SATISFIED.

4. **Case-type question framing** — one line stating, per case type, the RULE_CLAIM vs RULE_DRIFT question (drift = "is the current canonical commitment stale and is the proposed changed commitment now current", never "should it change"). The existing anti-policy framing is retained.

`contract_version` is bumped to `0.9.0-rc2` so a live `get_config` unambiguously distinguishes RC2 from RC1. `schema_version` stays `7` because storage is unchanged.

## 4. What deliberately did NOT change

- **Deterministic gate / validator** — byte-for-byte the same. RC2 makes the *model output* conform to the already-approved polarity; it does not weaken validation. An internally-inconsistent verdict still rolls back.
- **Storage layout** — 9 records (8/12/14/28/22/5/12/12/14 fields) and 36 top-level fields, verified identical to RC1. No field added, removed, reordered or retyped.
- **ABI** — 46 methods, 16 write / 30 view, `lock_bond` the only payable, no-parameter constructor. Verified identical via schema extraction. The frontend needs no changes and its 39 tests still pass.
- **Economics, challenges, versioning, evidence retrieval, equivalence strategy** — untouched. Adjudication still uses `prompt_comparative` requiring agreement on decision + per-dimension results, not prose.

## 5. Expected impact on convergence

The prompt now removes the single largest source of avoidable disagreement and malformed output observed live: a correctly-reasoning model will now assign `CONTRADICTORY_EVIDENCE` (and every other dimension) the polarity the gate expects, so legitimate claims can reach `ESTABLISHED` and validators are more likely to agree on the decision. This directly serves the standing "minimize avoidable UNDETERMINED" objective without making prose byte-identical.

## 6. Tests added

`tests/direct/test_rc2_polarity.py` (7 tests):

- `test_rc1_live_inverted_pairing_is_still_rejected` — feeds the **exact** RC1 live output and asserts the validator still rejects it with clean rollback (safety unchanged).
- `test_correctly_polarised_verdict_is_accepted` — the same case with `CONTRADICTORY_EVIDENCE=SATISFIED` now establishes.
- `test_genuine_contradiction_still_blocks_establishment` — an honest `NOT_ESTABLISHED` with a real contradiction still works; polarity clarity did not create a loophole.
- Four prompt-builder tests asserting the built prompt contains the global polarity rule and a `SATISFIED = …` definition for **every** dimension (claim and drift), the explicit `CONTRADICTORY_EVIDENCE` polarity, the worked counter-example, and the correct RULE_CLAIM / RULE_DRIFT question framing. They also assert the bare `SATISFIED | NOT_SATISFIED | UNCLEAR` enumeration is **gone**.

Full suite: **322 passed, 0 failed, 0 skipped.**

## 7. Remaining risks

1. **Prompt clarity reduces but cannot eliminate model error or UNDETERMINED.** RC2 must still be measured live; the fix is validated by unit tests and by direct reproduction of the failure, not yet by live consensus.
2. Other negatively-toned dimension *names* (`SOURCE_INDEPENDENCE`, `GOVERNANCE_LEGITIMACY`) were audited for the same inversion risk and are now explicitly defined, but only live measurement across varied sources will confirm they read cleanly at scale.
3. The 1 GEN bond on the superseded RC1 case `c_1` remains locked pending a separate decision (see the Stage 10B report §F3).
4. RC2 is a candidate only until you complete the Studio schema-load check and manual redeploy.
