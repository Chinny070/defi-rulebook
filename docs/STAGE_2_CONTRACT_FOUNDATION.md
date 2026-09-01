# Stage 2 — Production Contract Foundation

Scope: storage foundation and schema-loadability gate only. No adjudication, no web retrieval, no payout execution, no frontend, nothing deployed.

---

## 1. Canonical production file

`contracts/defi_rulebook.py` — 609 lines, 18,227 bytes, ASCII-clean, LF line endings.

SHA-256: `90f4cb8d678217070fda3ea3ab22cf21ea4f2a89c79092ae5d2e681cf62f59dc`

This is the single file that later stages extend. There are no parallel or competing production contract files, and no `contracts/capability_test/` was needed — Stage 2 required no capability probes.

Contract class: **`DefiRulebook`** (not `Contract`; see runtime note §4).

---

## 2. Runtime pin

```
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

First line of the file, nothing before it, SDK import three lines later. Rationale and the newer-runner open question are in `STAGE_2_RUNTIME_COMPATIBILITY.md` §1.

---

## 3. Storage model

Eight `@allow_storage @dataclass` records, each a bounded, named structure rather than an opaque JSON blob, so the extracted schema stays inspectable as the contract grows.

| Record | Purpose | Notes |
|---|---|---|
| `ProtocolRecord` | namespace metadata | field is `registrant`, **not** `official_owner` — registration confers no authority |
| `RuleRecord` | rule identity + lifecycle | **carries no canonical text**; `current_version = 0` means no adjudicated version exists |
| `RuleVersionRecord` | immutable canonical version | text, scope, exceptions, predecessor, originating case, fingerprint, status |
| `CaseRecord` | RULE_CLAIM / RULE_DRIFT | version + fingerprint binding, freeze binding, counters, bond reference |
| `EvidenceRecord` | bounded evidence | url, source_key, `retrieval_mode`, `anchors`, snapshot excerpt + fingerprint |
| `DimensionFinding` | one dimension result | name, finding, reason_code, reason, evidence_ids |
| `VerdictRecord` | one verdict | `DynArray[DimensionFinding]`, `replaces_verdict_id` preserves lineage |
| `ChallengeRecord` | one challenge | ground, argument, cited evidence, target verdict |
| `BondRecord` | one bond | role, depositor, amount, state, disposition, refund/slash split |

**Structural guarantees visible in the schema itself:**

- A rule shell has no text field, so an unadjudicated rule cannot be displayed as canonical. Only `RuleVersionRecord` holds rule text, and only adjudication may create one.
- `BondRecord.state` has no `PAYOUT_FAILED` — the Stage 1 addendum removed it as unrepresentable.
- `VerdictRecord.replaces_verdict_id` makes replacement additive; nothing overwrites a historical verdict.

Collections: primary `TreeMap[str, Record]` keyed by global id, plus `DynArray`/`TreeMap[str, DynArray[str]]` ordered indexes for bounded pagination, plus three deterministic uniqueness guards (`protocol_id_taken`, `evidence_url_seen`, `source_key_count`).

---

## 4. IDs

Global monotonic counters in `u256`, one per record type, rendered as short prefixed strings:

```
p_1   protocol      r_1   rule        c_1   case
e_1   evidence      v_1   verdict     ch_1  challenge     b_1  bond
```

Rule versions use a composite key built by `_version_key()`: `r_12:v_3`. Version numbers are per-rule ordinals, distinct from global ids.

No id is derived from arbitrary user-controlled text. `_is_ascii_id()` restricts a submitted `protocol_id` to `[a-z0-9_-]`, which keeps namespaces legible and collision-obvious.

---

## 5. Caps

All Stage 1 values, as named constants, no magic numbers:

```
MAX_PROTOCOLS 500          MAX_RULES_PER_PROTOCOL 100     MAX_VERSIONS_PER_RULE 50
MAX_CASES_PER_RULE 50      MAX_EVIDENCE_PER_CASE 8        MAX_EVIDENCE_PER_SOURCE_KEY 3
MAX_CHALLENGES_PER_CASE 2  MAX_VERDICTS_PER_CASE 3
MAX_PROTOCOL_ID_LEN 64     MAX_RULE_ID_LEN 80             MAX_DISPLAY_NAME_LEN 80
MAX_URL_LEN 400            MAX_SOURCE_KEY_LEN 120         MAX_TITLE_LEN 120
MAX_RULE_TEXT_LEN 600      MAX_SCOPE_LEN 200              MAX_EXCEPTIONS_LEN 300
MAX_EFFECTIVE_BASIS_LEN 120  MAX_RELEVANCE_NOTE_LEN 300
MAX_ANCHORS_LEN 200        MAX_ANCHOR_COUNT 3             MAX_EXCERPT_LEN 2000
MAX_DIMENSION_REASON_LEN 240  MAX_VERDICT_SUMMARY_LEN 400  MAX_CHALLENGE_ARGUMENT_LEN 600
DEFAULT_PAGE_SIZE 20       MAX_PAGE_SIZE 50
```

No cap conflicted with a GenLayer storage or schema constraint, so no architecture value was changed.

`_page_bounds()` clamps every future paginated read to `MAX_PAGE_SIZE` and never enumerates a whole collection.

---

## 6. Vocabularies

Represented as **module-level string constants plus frozen tuples**, not Python `Enum`.

Reasons: GenLayer storage does not support `Enum` ("store `.value`, not the enum itself"); bounded strings keep the extracted ABI stable and human-legible; and the deterministic validator in Stage 7 must compare model output against exact strings anyway. Validation is by `_in_vocabulary()`, a shared helper, so every check reports the same way.

Vocabularies defined: case types (2), case statuses (8), rule categories (10), rule statuses (4), version statuses (2), verdicts (3, plus a separate `MODEL_VERDICTS` of 2 that excludes `INVALID`), dimensions (6 claim / 7 drift), findings (3), evidence types (8), weak evidence types (2), retrieval modes (3), evidence states (3), challenge grounds (7), challenge statuses (4), bond states (4), bond roles (2), bond dispositions (3).

`MODEL_VERDICTS` existing separately from `VERDICTS` is the schema-level expression of a Stage 1 rule: the semantic model may never return `INVALID`; only the contract may declare it.

---

## 7. Admin model

Owner is set to the deployer in `__init__`. **The owner's entire authority is one method: `set_paused(bool)`.**

The owner **cannot**: create, edit or delete rules or versions; erase or alter evidence; propose, replace or override verdicts; resolve challenges; move, seize or redirect bonds; change the sink address; upgrade the contract; or alter finalized history. These are not merely unimplemented — a test asserts that no such method is exposed, and that assertion carries forward into every later stage.

`sink_address` is initialized to the deployer for now and is **not** owner-mutable. Whether it should become a configurable address before economics ship is an open item for Stage 10.

---

## 8. Pause semantics

Pause is configuration only in Stage 2; nothing yet reads it beyond `_not_paused()`, which is in place for later stages.

**Will respect pause** (blocked while paused): `register_protocol`, `propose_rule`, `open_claim_case`, `open_drift_case`, `submit_evidence`, `challenge` — i.e. anything creating **new exposure**.

**Will NOT respect pause** (must remain callable): `snapshot_evidence`, `freeze_evidence`, `adjudicate`, `readjudicate`, `finalize`, `settle_bond` — i.e. anything that lets already-committed activity reach a terminal state. Pause must never strand a bond or freeze a case mid-lifecycle, and must never be usable as a way to avoid paying out.

---

## 9. Current public ABI

Extracted locally with `genvm-lint schema` (`"ok": true`):

**Writes (1):** `set_paused(flag: bool) -> null`, non-payable

**Views (4):** `get_config()`, `get_caps()`, `get_vocabularies()`, `get_counts()` — all `dict`, no parameters, no unbounded collections

Constructor takes no parameters.

`get_config()` returns contract name/version/schema version/dimension-set version, owner, sink, paused flag, and the frozen economic configuration. `case_bond` is returned as a **decimal string**, not a number, so an 18-decimal value survives JSON consumers without precision loss.

---

## 10. Deferred ABI

Intentionally absent, to be added in the stage that implements each state machine — never as no-op stubs:

`register_protocol`, `propose_rule` (Stage 3) · `submit_evidence`, `snapshot_evidence`, `freeze_evidence` (Stage 5) · `open_claim_case`, `adjudicate` (Stages 6-7) · `open_drift_case` (Stage 8) · `challenge`, `readjudicate` (Stage 9) · `finalize`, `settle_bond` (Stage 10) · all paginated views alongside the data they page over.

A test asserts none of these exists yet, so a placeholder cannot be introduced accidentally.

---

## 11. Checks run

| Check | Command | Result |
|---|---|---|
| Lint (AST safety) | `genvm-lint lint contracts/defi_rulebook.py --json` | `ok: true`, 2 checks passed, 1 documented warning |
| Validate (SDK semantics) | `genvm-lint check contracts/defi_rulebook.py` | **Validation passed** — Contract: `DefiRulebook`, Methods: 5 (4 view, 1 write) |
| **Local schema extraction** | `genvm-lint schema contracts/defi_rulebook.py --json` | **`{"ok": true, ...}`** — full ABI extracted |
| Typecheck (Pyright) | `genvm-lint typecheck contracts/defi_rulebook.py` | No type errors found |
| Direct tests | `python -m pytest tests -q` | **42 passed** |
| ASCII / source shape | `tests/test_source_shape.py` | clean; no CRLF; no smart quotes |

The single lint warning is `W002 Non-deterministic call 'time.time()'` — a documented false positive; see `STAGE_2_RUNTIME_COMPATIBILITY.md` §5.

**Precise wording:** this is **LOCAL GENLAYER SCHEMA EXTRACTION PASSED**. It is not a claim that Studio schema loading was confirmed — that requires the runtime, and nothing was deployed.

---

## 12. Manual verification step for the user

Local extraction is the strongest non-deployment evidence available, but it exercises the linter's SDK loader, not Studio's. To confirm end to end, without any commitment:

1. Open GenLayer Studio.
2. Create a new contract and paste the full contents of `contracts/defi_rulebook.py` — **the `# { "Depends": ... }` line must remain the first line**.
3. Studio should parse the contract and display the schema/ABI: constructor with no parameters, one write method `set_paused`, four view methods.
4. If the ABI panel renders, schema loading is confirmed. If **"could not load contract schema"** appears, stop and report it before Stage 3; do not deploy.
5. Deployment remains yours to perform, whenever you choose.

---

## 13. Known unknowns

Carried from `STAGE_2_RUNTIME_COMPATIBILITY.md` §10: outbound transfer failure semantics; the exact `UserError` symbol; whether to adopt the newer runner hash; `strict_eq` convergence on real pages; and whether Studio's loader agrees with the local extractor.

None of these is designed around. Each has a named stage.

---

## 14. Binding release requirements (recorded, not yet due)

**Production scale.** The final contract must be a complete production implementation of the approved architecture and may naturally exceed 1000 lines. It must not be padded to reach a number, and must not collapse lifecycle or security behaviour into a demo. Stage 2 is 609 lines because it is a foundation; that is not a target for later stages in either direction.

The final source must: load its schema; use currently supported GenLayer patterns; minimize avoidable `Undetermined` consensus; preserve strict deterministic validation; and implement the full lifecycle safely.

**Consensus.** The eventual non-deterministic architecture must **minimize avoidable `Consensus Result = UNDETERMINED`** without weakening correctness. No GenLayer contract can honestly promise zero Undetermined outcomes, and this project will not claim that. Concretely, later stages must: avoid `strict_eq` over large dynamic webpages; retrieve only bounded evidence-relevant content; measure `get` vs `render` convergence before choosing; use semantic equivalence where appropriate; keep deterministic validation strict; keep evidence snapshot separate from adjudication; and preserve retryability.
