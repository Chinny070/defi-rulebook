# Stage 6 — Challenges, Finalization and Immutable Rule Versions

Scope: the dispute window, re-adjudication, finalization, and the creation of canonical rule versions. No GEN economics, no frontend, nothing deployed by Claude.

Contract: `contracts/defi_rulebook.py`, 2840 lines, SHA-256 `1cb878141899fa5eb1c934caa6bb8c9ca703c17bb50604e96a2817aab507a806`.

This is the stage where a verdict becomes — or fails to become — a rule.

---

## 1. Challenge philosophy

A GenLayer verdict is a **proposal**, not a canonical rule. Between the two sits a window in which anyone can allege that the adjudication got something specific wrong.

A challenge is **not** a vote, not a signal of disagreement, and not a popularity contest. It must name **one ground** from a bounded vocabulary and explain the defect in at least 16 characters. There is no DAO voting, no quorum, no stake-weighting and no social component anywhere in the mechanism: the only thing that resolves a challenge is re-adjudication over the same frozen evidence.

The grounds map one-to-one onto the seven semantic dimensions, plus a schema defect:

```
SOURCE_AUTHORITY_ERROR           SOURCE_INDEPENDENCE_ERROR
TEMPORAL_VALIDITY_ERROR          GOVERNANCE_LEGITIMACY_ERROR
CLAIM_SUPPORT_ERROR              CONTRADICTORY_EVIDENCE_ERROR
EXISTING_RULE_CONSISTENCY_ERROR  MALFORMED_VERDICT_ERROR
```

**This replaces the Stage 1 ground vocabulary**, which used differently-shaped names (`AUTHORITATIVE_EVIDENCE_MISCLASSIFIED`, `CLAIM_OVERREACH`, …). The Stage 6 brief's list is strictly better: each ground names the exact dimension it attacks, so a challenge is machine-linkable to the finding it disputes rather than being prose a reader has to map by hand.

---

## 2. Lifecycle

```
EVIDENCE_FROZEN
      |  request_adjudication
      v
VERDICT_PROPOSED  <-- challenge window opens here, deadline = verdict_at + 72h
      |                     \
      |  finalize_case       \  open_challenge
      |  (after deadline)     v
      |                    CHALLENGED
      |                       |  resolve_challenge  (re-adjudicates, appends a verdict)
      |                       v
      |                  RE_ADJUDICATED
      |                    /
      v                   v
   FINALIZED   or   REJECTED          [terminal]

   INVALIDATED (stale binding)         [terminal, Stage 3]
   ABANDONED  (evidence window lapsed) [terminal, Stage 3]
```

`FINALIZED` means the verdict was `ESTABLISHED` and a canonical version was minted. `REJECTED` means the verdict was `NOT_ESTABLISHED`: a real, permanent outcome that mints no rule.

**Deviation from the brief, for approval: there is no `CHALLENGE_WINDOW` status.** The window is a property of time, not a state someone transitions into — it opens the moment the first verdict is written and is fully described by `challenge_deadline`. A separate status would either need its own transaction (a no-op step that buys nothing) or be written and cleared inside one transaction, where it is never observable. This is the same reasoning that kept `ADJUDICATION_RUNNING` out of Stage 5. Instead, `get_challenge_window(case_id)` reports `in_challenge_window`, `open_to_new_challenges` and `finalizable` as derived facts.

---

## 3. Challenge rules

| Rule | Value | Reason |
|---|---|---|
| Who may challenge | Anyone **except the case reporter** | Self-challenge is a free re-roll of the adjudication |
| Permission | Permissionless otherwise | No gatekeeper, no registrant privilege |
| Max challenges per case | **3** | The Stage 6 brief's figure; supersedes the Stage 1 value of 2 |
| Concurrency | **One open challenge at a time** | Parallel challenges against one verdict create ordering ambiguity |
| Same ground twice | **Rejected, per case** | Re-raising the same alleged defect after a loss is how a dispute loop starts |
| Argument length | 16–600 characters | "I disagree" cannot be a challenge |
| Cited evidence | Must be completed snapshots **of this case**, no duplicates | A challenge cannot import outside evidence |
| Window | 72 hours from the first verdict, **never extended** | A late challenge does not buy more time |
| Pause | Blocks new challenges; never blocks resolution or finalization | Pause stops new exposure, never strands an obligation |

`MAX_VERDICTS_PER_CASE` was raised from 3 to 4 to match: one initial verdict plus up to three re-adjudications.

---

## 4. Re-adjudication

`resolve_challenge(challenge_id)` re-runs adjudication over the **identical frozen evidence set**, with the challenge appended to the prompt.

Because the evidence cannot change, a different outcome is attributable to the reasoning rather than to the world having moved. The contract enforces this: it compares the current snapshot digest against the digest stored on the challenged verdict and aborts with `[STATE_CHANGED]` if they differ.

The challenge text is added under its own heading and wrapped in the same `BEGIN/END_UNTRUSTED_PROTOCOL_EVIDENCE` markers as page content, labelled an **unverified participant assertion**, with an explicit instruction not to defer to it. The challenger's address is not included. The model is told that if the challenge is unfounded it should return the same decision as before.

Outcome:

- **UPHELD** — re-adjudication reached a different decision
- **REJECTED** — the original decision survived

Both append a new verdict. Nothing is overwritten.

Malformed re-adjudication output rolls back atomically: the challenge stays `OPEN`, the case stays `CHALLENGED`, no verdict is appended, and the whole thing is retryable. Tested.

---

## 5. Finalization

`finalize_case(case_id)` — permissionless once the window has closed.

Preconditions, all deterministic:

1. no open challenge (`[CHALLENGE_OPEN]`)
2. case is `VERDICT_PROPOSED` or `RE_ADJUDICATED`
3. the challenge deadline has passed (`[WINDOW_NOT_EXPIRED]`)
4. a verdict exists (`[NO_VERDICT]`)
5. the stored verdict has a valid decision and the right dimension count (`[MALFORMED_VERDICT]`)
6. the version binding is still current (`[STALE_CASE]`)
7. the case fingerprint still matches the verdict's (`[STALE_CASE]`)
8. the snapshot digest still matches the verdict's (`[STALE_CASE]`)
9. the target version key does not already exist (`[VERSION_EXISTS]`)

Checks 5–9 are the point of §14 of the brief: **the finalizer does not trust the model's word.** It re-reads the stored verdict, re-derives the digests, and refuses to mint a version against anything that has shifted. Any failure aborts the transaction; nothing partial is written.

---

## 6. Canonical rule versions

**`finalize_case` is the only code path that can construct a `RuleVersionRecord`.** A source-shape test parses the AST, asserts exactly one construction exists in the whole contract, and asserts it sits inside `finalize_case`.

On `ESTABLISHED`:

- `version_number = current_version + 1` (1 for a first claim, N+1 for drift)
- the new version is written with status `CURRENT`
- the previous version's `status` flips to `SUPERSEDED` — **that flag is the only field ever touched on an existing version**; its text, scope, exceptions, evidence digest, fingerprint, originating case and originating verdict are never modified
- `rule.current_version`, `current_fingerprint` and `version_count` advance
- the rule becomes `ACTIVE` and its active-case lock is released

On `NOT_ESTABLISHED`: the case closes as `REJECTED`, the lock is released, and no version is created.

### Version record

```
version_id              rule_id:v_N
rule_id, version, predecessor
text, scope, exceptions        (verbatim from the frozen case)
originating_case_id
originating_verdict_id
evidence_digest                (the snapshot set the verdict was reached on)
effective_basis                (derived: "verdict v_N over K frozen sources")
status                         CURRENT | SUPERSEDED
established_at
fingerprint
```

`effective_basis` is **derived deterministically**, not taken from the model. The model is never asked for a date, so none is invented.

### Version fingerprint

Scheme `DRB-VERSION-FP-v1`, sha256 over `|`-joined length-prefixed fields: scheme, rule_id, version, text, scope, exceptions, predecessor, originating case, originating verdict, evidence digest.

This becomes `rule.current_fingerprint`, which is exactly what a later `RULE_DRIFT` case must name to bind against it. The concurrency anchor introduced in Stage 3 now closes its loop: a drift case names the fingerprint of the version it intends to supersede, and finalization refuses if that fingerprint has moved.

---

## 7. Immutable history guarantees

| Guarantee | How |
|---|---|
| Verdicts are appended, never replaced | `resolve_challenge` writes a new `VerdictRecord` with `replaces_verdict_id` pointing at its predecessor |
| Old verdicts stay readable | `list_case_verdicts` returns the full chain in order |
| Challenges are permanent | Resolved challenges keep their ground, argument, cited evidence, outcome and resulting verdict |
| Old versions keep their content | Only `status` changes on supersession |
| No method can edit or delete history | Tested by asserting eleven plausible mutator names do not exist |
| Only one place mints versions | AST-asserted single construction site |
| Evidence is never re-opened | The frozen set and snapshots are untouched by every Stage 6 path |

---

## 8. Stale protection

Rechecked at both `resolve_challenge` and `finalize_case`:

- rule `current_version` and `current_fingerprint` still equal the case's binding
- case fingerprint still equals the verdict's
- snapshot digest still equals the verdict's

Any mismatch returns `[STALE_CASE]` and writes nothing. **A case never silently mints a wrong version.** Two tests cover this directly: one moves the rule's canonical state out from under a finalizable case, the other tampers with a snapshot fingerprint; both are refused.

---

## 9. ABI additions

**Writes (+3):** `open_challenge`, `resolve_challenge`, `finalize_case`
**Views (+6):** `get_challenge`, `list_case_challenges`, `get_challenge_window`, `get_rule_version`, `list_rule_versions`, `get_current_rule_version`

Totals: **14 writes, 25 views**, none payable. All list views are offset/limit paginated and clamped.

`get_current_rule_version` returns `has_canonical_version: false` and **no text field** for an unverified rule, so a proposed topic can never be rendered as a commitment.

---

## 10. Storage changes

All fields **appended**; no existing field was reordered or removed.

| Record | Added |
|---|---|
| `RuleVersionRecord` | `version_id`, `originating_verdict_id`, `evidence_digest` |
| `CaseRecord` | `challenge_deadline`, `open_challenge_id`, `final_verdict_id` |
| `VerdictRecord` | `evidence_digest`, `challenge_id` |
| `ChallengeRecord` | `resulting_verdict_id` |

Constants changed: `MAX_CHALLENGES_PER_CASE` 2 → **3**, `MAX_VERDICTS_PER_CASE` 3 → **4**, `MIN_CHALLENGE_ARGUMENT_LEN` = 16 added, `CHALLENGE_GROUNDS` replaced, `VERSION_FP_SCHEME` added, case statuses `RE_ADJUDICATED` and `REJECTED` added.

---

## 11. Known limitations

1. **A challenge resolves by re-asking the same model.** If the model is systematically wrong about a dimension, re-adjudication may reproduce the error. The economics stage adds the counterweight — being wrong must cost something.
2. **UPHELD/REJECTED is decided by comparing decisions.** A re-adjudication that fixes a dimension's reasoning but reaches the same decision is recorded as REJECTED, even though the challenge improved the record.
3. **No economics.** Challenging is free, so the only costs of a frivolous challenge are gas and the one-per-ground cap. Bonds arrive in the economics stage; until then the spam resistance is weaker than the approved design intends.
4. **Three challenges is a hard ceiling.** A fourth genuine defect cannot be raised on the same case.
5. **The window is fixed at 72 hours** and never extends, so a defect discovered late cannot be raised.
6. **Finalization needs someone to call it.** It is permissionless and cheap, but not automatic.
7. **`effective_basis` is bookkeeping, not a real effective date.** It names the verdict and source count, because the contract has no trustworthy way to date a commitment.
8. **A rule can be superseded only through a full drift case**, which is deliberate but slow.
9. **`time.time()` still raises linter warning W002** — a documented false positive.

---

## 12. What the next stage adds

GEN economics: the bond taken at case open, the challenger bond, refund on `ESTABLISHED`/`INVALID`, the asymmetric slash on `NOT_ESTABLISHED` (50% claim, 25% drift), the challenger reward, and the rollback-compatible `READY_FOR_PAYOUT → SETTLED` state machine from the Stage 1 addendum.

The storage for all of it — `BondRecord`, bond states, roles, dispositions, the configured amounts — has been declared since Stage 2 and is still unwritten. `finalize_case` is the natural place to set a bond disposition, and it does not touch one today.
