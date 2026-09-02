# Stage 3 — Deterministic Lifecycle Through Evidence Freeze

Scope: protocol registry, rule shells, case creation, evidence submission, deterministic freeze, stale-case protection, bounded reads. Fully deterministic — no web retrieval, no adjudication, no canonical versions, no payouts, no frontend, nothing deployed by Claude.

Supersedes the ABI sections of `STAGE_2_CONTRACT_FOUNDATION.md`; everything else there still holds.

Contract: `contracts/defi_rulebook.py`, 1431 lines, SHA-256 `5bd38f6f07ea626fcfe94177ea840a88e685592e3dcad575e470f194f317a24c`.

---

## 1. Resolved runtime unknowns

Two Stage 2 ambiguities were closed by introspecting the SDK that the pinned runner actually resolves, not by reading docs.

**`UserError`.** The official skill used both `gl.UserError` and `gl.vm.UserError`. Loading the pinned SDK settles it:

```
gl UserError?     False
gl.vm UserError?  True
gl.vm errors:     ['UserError', 'VMError']
```

**Selected: `gl.vm.UserError`.** A source-shape test bans the non-existent `gl.UserError`.

**`hashlib` and `urllib.parse`.** Both are permitted — `urllib.parse` is on the linter's explicit `ALLOWED_MODULES` allowlist, and `hashlib` is absent from `FORBIDDEN_MODULES`. Both were then executed under the real SDK in direct mode: `sha256("abc")` produced the correct digest, and `urlsplit`/`urlunsplit` behaved as expected. Only after that were they used in the contract.

**Runner pin unchanged**: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`. The tooling still advertises a newer runner, but no current documentation establishes it as the supported choice, and the current pin loaded in Studio. Stability wins.

---

## 2. Error model

`gl.vm.UserError` carrying a stable bracketed code plus a short detail. No stack detail is exposed.

```
[PAUSED] [NOT_OWNER] [INVALID_INPUT] [PROTOCOL_EXISTS] [PROTOCOL_NOT_FOUND]
[PROTOCOL_CAP] [RULE_NOT_FOUND] [RULE_CAP] [DUPLICATE_RULE]
[RULE_ALREADY_ESTABLISHED] [NO_CANONICAL_RULE] [ACTIVE_CASE_EXISTS] [CASE_CAP]
[CASE_NOT_FOUND] [CASE_NOT_OPEN] [NOT_REPORTER] [EVIDENCE_CAP] [SOURCE_CAP]
[MIN_EVIDENCE] [DUPLICATE_EVIDENCE] [EVIDENCE_NOT_FOUND] [INVALID_URL]
[INVALID_ANCHORS] [STALE_CASE] [NOT_STALE] [WINDOW_OPEN]
```

Codes are asserted by tests, so renaming one breaks the build rather than silently changing the frontend contract.

---

## 3. Protocol registration

`register_protocol(protocol_id, display_name, homepage_url, docs_root_url) -> str`

Registration reserves a **community-maintained namespace and nothing else**. It is not ownership, not verified identity, not governance authority, and not an exclusive right to define rules.

**Identifier format:** trimmed, lowercased, then required to match `[a-z0-9-_]`, length 2–64, containing at least one alphanumeric. This rejects empty, whitespace-only, invisible and punctuation-only identifiers. Normalization happens before the uniqueness check, so `AAVE-V3` and `aave-v3` cannot both exist.

`homepage_url` and `docs_root_url` are optional; when present they pass the same URL normalization as evidence. They are **submitter assertions** and are never treated as proof of identity.

**What the registrant cannot do:** edit or delete rules, block anyone from creating rule shells in the namespace, open or veto cases, censor evidence, or freeze/close another user's case. Registrant is a bookkeeping fact, tested by `test_registrant_cannot_censor_other_users`.

**Residual risk, stated plainly: namespace squatting remains possible.** V1 cannot cryptographically prove protocol identity, so anyone may register a plausible name first. Mitigations are that squatting yields an *empty* Rulebook (no rule can become canonical without adjudication), the registrant gains no powers, and every protocol view returns `community_maintained: true` / `officially_verified: false` so the future frontend cannot accidentally imply otherwise.

---

## 4. Rule shells

`propose_rule(protocol_id, category, title) -> rule_id`

A shell is a **topic, not a commitment**: `current_version = 0`, `current_fingerprint = ""`, `status = UNVERIFIED`, `version_count = 0`, and **no text field exists on the record at all**. There is nothing to mistake for canonical content.

Permissionless within a registered namespace. Category must be one of the ten approved values — `OTHER`/`CUSTOM` do not exist.

**Duplicate guard:** the same protocol + category + case-folded, whitespace-collapsed title is rejected as `[DUPLICATE_RULE]`. The same title under a different category is allowed, since categories scope meaning.

Creating a shell never creates a `RuleVersionRecord`, canonical text, established status, or verdict.

---

## 5. Identifiers

| Kind | Format | Scope |
|---|---|---|
| Protocol | user-chosen slug, normalized | globally unique, the canonical key |
| Rule | `r_<n>` from a global counter | **globally unique**; `protocol_id` on the record gives ownership |
| Case | `c_<n>` global counter | globally unique |
| Evidence | `e_<n>` global counter | globally unique |
| Rule version | `<rule_id>:v_<n>` | version number is a per-rule ordinal |

Rules use a global id rather than a protocol-local slug so every lookup has one unambiguous key and no composite parsing is needed. Titles are display-only and never form a key. No identifier derives from unbounded user text.

---

## 6. RULE_CLAIM

`open_rule_claim(rule_id, text, scope, exceptions) -> case_id`

Asserts that authoritative public evidence **establishes** an initial rule — never that a rule *should* be adopted.

- Rejected with `[RULE_ALREADY_ESTABLISHED]` if the rule already has a canonical version. Changes to an established rule go through RULE_DRIFT. This keeps the two case types semantically disjoint.
- Binds `expected_version = 0` and `expected_fingerprint = ""`, which is a real binding, not a placeholder: it is what makes first-version staleness detectable (§9).
- Sets `status = EVIDENCE_OPEN`, `evidence_deadline = now + evidence_window_seconds` (7 days).

---

## 7. RULE_DRIFT

`open_rule_drift(rule_id, expected_version, expected_fingerprint, text, scope, exceptions) -> case_id`

Asserts the canonical rule is **stale** because newer authoritative evidence establishes a different operative commitment.

The caller must name the exact version and fingerprint being challenged; both are checked against current state at open time and rejected with `[STALE_CASE]` if either differs. A drift case can never say merely "change Rule #3" — it says "I am challenging canonical version X with fingerprint Y." That binding is the concurrency anchor.

Rejected with `[NO_CANONICAL_RULE]` when the rule has no established version.

Opening a drift case moves the rule's status from `ACTIVE` to `DISPUTED`.

---

## 8. Active-case lock

`rule.active_case_id` holds at most one case that could change canonical state. A second attempt fails with `[ACTIVE_CASE_EXISTS]`.

The lock is set on open and cleared **only** by a terminal transition. In Stage 3 the two terminal transitions are `invalidate_stale_case` and `abandon_expired_case`; the adjudication path will add the rest. There is deliberately **no admin escape hatch** — the owner cannot clear a lock, and a test asserts no such method exists.

Clearing a lock restores rule status to `ACTIVE` if a canonical version exists, otherwise `UNVERIFIED`.

---

## 9. Stale-case protection

`_binding_is_current(case)` is true when the rule's present `current_version` **and** `current_fingerprint` both still equal what the case bound at open time.

**At freeze**, a stale case is **rejected** with `[STALE_CASE]`. It is not silently converted into an outcome, because Stage 3 has no bond settlement and inventing an economic result before GEN logic exists would be wrong.

**The explicit exit** is `invalidate_stale_case(case_id)`, permissionless, which sets `status = INVALIDATED`, `invalid_reason = STALE_VERSION_BINDING`, and releases the lock. It records a lifecycle outcome only — **nothing is paid**. Bond disposition for INVALIDATED cases (full refund, per the approved economics) belongs to the payout stage.

This covers both case types:

- **Stale RULE_CLAIM** — someone else established v1 while the case was open. Freezing would let it mint a second v1 or overwrite history. Refused.
- **Stale RULE_DRIFT** — the rule advanced from v3 to v4. A case frozen against v3 must never mutate v4. Refused.

Both are tested directly (`test_stale_claim_cannot_freeze`, `test_stale_drift_cannot_freeze`).

**Companion exit:** `abandon_expired_case(case_id)`, permissionless, closes an un-frozen case once `evidence_deadline` has passed (`status = ABANDONED`, reason `EVIDENCE_WINDOW_EXPIRED`). Without it a reporter could open a case, never freeze, and hold a rule's lock forever.

---

## 10. Evidence model

`submit_evidence(case_id, url, retrieval_mode, anchors, claimed_type, relevance_note, claimed_published_at, published_time_known) -> evidence_id`

Nothing is fetched, rendered or hashed in Stage 3.

| Field | Source | Note |
|---|---|---|
| `url` | submitter | stored as given (trimmed) |
| `url_key` | **deterministic** | normalized URL, §11 |
| `source_key` | **deterministic** | host + first path segment, §12 |
| `retrieval_mode` | submitter | `GET` / `RENDER_TEXT` / `RENDER_TEXT_WAIT` |
| `anchors` | submitter | 1–3 terms, §13 |
| `claimed_type` | **submitter assertion** | §14 |
| `relevance_note` | submitter | 4–300 chars |
| `claimed_published_at` + `claimed_published_known` | **submitter assertion** | §15 |
| `state` | deterministic | `SUBMITTED` in Stage 3 |
| `snapshot`, `snapshot_fingerprint`, `snapshot_at` | — | empty/zero until Stage 4 |

Caps: 8 evidence per case, 3 per source key, enforced per case.

---

## 11. URL normalization

Applied to evidence URLs and to protocol metadata URLs. Deterministic, and deliberately conservative — it must never change **which resource is meant**.

1. Trim; reject empty or over 400 characters.
2. `urlsplit`; scheme must be `http` or `https` (case-insensitive), else `[INVALID_URL]`.
3. Lowercase scheme and host. Reject embedded credentials (`user:pw@`), empty hosts, hosts containing spaces, and hosts with no dot (so `localhost` and bare names are refused).
4. Strip one trailing `.` from the host.
5. Drop the default port: `:80` for http, `:443` for https.
6. **Drop the fragment entirely** — `#section` never selects a different resource.
7. Empty path becomes `/`; a trailing `/` is removed except at the root.
8. **Query preserved verbatim** — order and case can be semantic, so `?b=2&a=1` is not reordered.
9. **Path case preserved** — many documentation hosts are case-sensitive.
10. Reject if the normalized result exceeds 400 characters.

Worked examples (all asserted by tests):

```
HTTPS://Docs.Example.COM/FAQ        -> https://docs.example.com/FAQ
https://docs.example.com/faq/       -> https://docs.example.com/faq
https://docs.example.com            -> https://docs.example.com/
https://docs.example.com:443/faq    -> https://docs.example.com/faq
https://docs.example.com/faq#sec-3  -> https://docs.example.com/faq
https://docs.example.com/faq?v=2    -> https://docs.example.com/faq?v=2
https://ex.example.com/Docs/Fees?b=2&a=1 -> unchanged
```

---

## 12. Deduplication

**Syntactic only.** Stage 3 makes no claim about semantic independence.

- **Exact duplicate:** the same `url_key` within the same case is rejected with `[DUPLICATE_EVIDENCE]`. Because normalization runs first, `HTTPS://DOCS.EXAMPLE.COM/faq/withdrawals#x` is caught as a duplicate of `https://docs.example.com/faq/withdrawals`.
- **Source family:** `source_key` = host (with `www.` stripped) + first path segment. At most 3 evidence items per source key per case, `[SOURCE_CAP]`.

`source_key` is a **counting and grouping hint, never an independence claim.** Two different hosts may still be the same source republished, and the same host may carry genuinely independent material. Whether sources are independent is semantic and is decided later by the `SOURCE_INDEPENDENCE` dimension. The stored metadata — full URL, normalized key, source key, claimed type, submitter — is what lets that later judgement be made.

---

## 13. Anchors

1 to 3 terms, each 3–60 characters after whitespace collapsing, 200 characters total, case-insensitively unique within one evidence item. Empty, blank and duplicate anchors are rejected with `[INVALID_ANCHORS]`.

Anchors are submitter-supplied and stored before freeze, then frozen with the case. **Stage 4 retrieval must use exactly these frozen anchors** for its deterministic excerpt extraction — that is what makes the extraction reproducible by any reader. No extraction runs in Stage 3.

---

## 14. Authority assertions

The approved Stage 1 vocabulary, unchanged:

```
OFFICIAL_DOCUMENTATION        FINALIZED_GOVERNANCE_DECISION
GOVERNANCE_PROPOSAL           PROTOCOL_SPECIFICATION
OFFICIAL_ANNOUNCEMENT         SECURITY_DISCLOSURE_OR_AUDIT
IMPLEMENTATION_EVIDENCE       THIRD_PARTY_ANALYSIS
```

There is deliberately **no `OFFICIAL_VERIFIED`** value: nothing here is cryptographically verified, and a value implying otherwise would be a lie encoded in the schema.

`claimed_type` is a **submitter assertion**. The contract validates only that the value is in the vocabulary. Every evidence view returns `claimed_type_is_submitter_assertion: true` so no consumer can mistake it for a finding. Whether a source deserves its claimed authority is decided later by `SOURCE_AUTHORITY`, and a mislabelled type is itself a challenge ground.

`WEAK_EVIDENCE_TYPES` (`GOVERNANCE_PROPOSAL`, `THIRD_PARTY_ANALYSIS`) is published for the later deterministic gate that a proposal-only evidence set can never establish a rule. Stage 3 stores it; it gates nothing yet.

---

## 15. Temporal metadata

Three separate times, never conflated:

| Time | Meaning |
|---|---|
| `claimed_published_at` + `claimed_published_known` | **submitter assertion** about the source |
| `submitted_at` | deterministic block time of submission |
| `snapshot_at` | retrieval time — zero until Stage 4 |

**UNKNOWN is explicit.** When `published_time_known` is false the stored timestamp is forced to 0 and the flag records that 0 means "unknown", never "1970". When the flag is true a non-zero timestamp is required, else `[INVALID_INPUT]`. The contract never fabricates or infers a publication date; temporal validity is judged later from retrieved content.

---

## 16. Evidence freeze

`freeze_evidence(case_id) -> case_fingerprint`

This is the architectural boundary before any non-determinism.

Preconditions: case is `EVIDENCE_OPEN`; caller is the reporter; at least `MIN_EVIDENCE_PER_CASE` (1) evidence items; the version binding is still current (§9); the frozen set is within cap.

Effects: the exact ordered evidence id list is copied into `case.frozen_evidence_ids`, the case fingerprint is computed and stored, `status = EVIDENCE_FROZEN`, `frozen_at` is set.

**After freeze:** no evidence can be added or removed, anchors cannot change, claimed text/scope/exceptions cannot change, the expected version/fingerprint cannot change, and the protocol/rule target cannot change. There is no method that mutates any of them — immutability is structural, not merely guarded.

**Reporter-only, and why.** A permissionless freeze would let anyone seal a case the instant its first source landed, denying the reporter any chance to finish assembling evidence — a cheap griefing vector. The counterweight is that `abandon_expired_case` is permissionless, so a reporter who never freezes cannot hold a rule's lock beyond the evidence window. Together: the reporter controls *when* to freeze, but not *whether* to release.

**Allowed while paused.** Pause stops new exposure; it must never strand an already-open case.

---

## 17. Case fingerprint

Scheme id: **`DRB-CASE-FP-v1`**, published by `get_config()` and `get_case_frozen_evidence()`.

Every field is length-prefixed as `<len>:<value>` and joined with `|`. Length-prefixing means no field boundary can be forged by content. Evidence order is the **append order**, never dict iteration order.

Preimage:

```
DRB-CASE-FP-v1 | case_type | protocol_id | rule_id
               | expected_version | expected_fingerprint
               | claimed_text | claimed_scope | claimed_exceptions
               | dimension_set_version | evidence_count
then per evidence, in frozen order:
               | evidence_id | url_key | claimed_type | retrieval_mode
               | anchors joined by U+001F
```

`case_fingerprint = sha256(preimage_utf8).hexdigest()`

`test_fingerprint_matches_the_documented_preimage` recomputes this independently in the test suite, so contract and documentation cannot drift apart silently.

**Versioned deliberately.** Stage 5 will need per-evidence *snapshot* fingerprints in the preimage, which do not exist yet. That will be `DRB-CASE-FP-v2`. Claiming v1 binds content it cannot yet see would be dishonest.

---

## 18. Pause behaviour

| Blocked while paused | Allowed while paused |
|---|---|
| `register_protocol` | `freeze_evidence` |
| `propose_rule` | `invalidate_stale_case` |
| `open_rule_claim` | `abandon_expired_case` |
| `open_rule_drift` | all views |
| `submit_evidence` | |

The rule: pause stops **new exposure**; it must never strand an open obligation or become a way to trap a case. Every allowed method moves an already-open case toward a terminal state.

---

## 19. Public ABI

**Writes (9):** `set_paused`, `register_protocol`, `propose_rule`, `open_rule_claim`, `open_rule_drift`, `submit_evidence`, `freeze_evidence`, `invalidate_stale_case`, `abandon_expired_case`

**Views (13):** `get_config`, `get_caps`, `get_vocabularies`, `get_counts`, `get_protocol`, `list_protocols`, `get_rule`, `list_rules`, `get_case`, `list_rule_cases`, `get_evidence`, `list_case_evidence`, `get_case_frozen_evidence`

Constructor takes no parameters. No method is payable. Every list view takes `(offset, limit)` and clamps through `_page_bounds`: a non-positive limit becomes 20, anything above 50 becomes 50, and an out-of-range offset returns an empty page. No unbounded array is ever returned.

**Deferred to their own stages:** `snapshot_evidence` (4), `adjudicate` (7), `readjudicate`/`challenge` (9), `finalize`/`settle_bond` (10). None exists as a no-op stub, and a test asserts their absence.

---

## 20. Caps changed from Stage 2

Added, not changed: `MIN_EVIDENCE_PER_CASE = 1`, `MIN_PROTOCOL_ID_LEN = 2`, `MIN_TITLE_LEN = 4`, `MIN_RULE_TEXT_LEN = 8`, `MIN_RELEVANCE_NOTE_LEN = 4`, `MIN_ANCHOR_COUNT = 1`, `MAX_ANCHOR_LEN = 60`, `MIN_ANCHOR_LEN = 3`.

Every Stage 1 cap is unchanged. No cap conflicted with a GenLayer storage or schema constraint.

Storage added since Stage 2: `RuleRecord.creator`, `RuleRecord.active_case_id` (renamed from `open_case_id`), `CaseRecord.invalid_reason`, `CaseRecord.frozen_evidence_ids`, `CaseRecord.evidence_deadline`, `EvidenceRecord.url_key`, `EvidenceRecord.claimed_published_known`, `EvidenceRecord.anchors` (now `DynArray[str]`), and the `rule_title_taken` guard map.

---

## 21. Known limitations

1. **Namespace squatting is still possible.** No cryptographic protocol identity in V1.
2. **Deduplication is syntactic only.** Two URLs that republish identical text are not detected here; that is a semantic judgement for adjudication.
3. **`source_key` is a heuristic.** Host + first path segment groups most documentation sites usefully but is not a claim about ownership or independence.
4. **Authority and publication dates are unverified assertions** until adjudication.
5. **Minimum evidence is 1.** Corroboration is a semantic matter (`SOURCE_INDEPENDENCE`), not a deterministic gate; a single-source case can freeze but should not survive adjudication on its own.
6. **The fingerprint binds evidence identity, not content.** Content binding arrives with snapshots in Stage 4/5 under scheme v2.
7. **A stale case still needs someone to call `invalidate_stale_case`.** It is permissionless and cheap, but not automatic.
8. **URL normalization cannot detect redirects.** Two URLs that resolve to the same page are distinct here.
9. **`time.time()` raises linter warning W002** — a documented false positive; GenVM pins the clock to transaction time.

---

## 22. What Stage 4 adds

The live web convergence gate, per the Stage 1 addendum: measured `get` vs `render(mode="text")` vs `render(+wait)` behaviour across five real source classes, with SUCCESS and **UNDETERMINED** rates, excerpt stability and fingerprint stability. Also re-verification of payable entry, `emit_transfer`, and its failure semantics.

No production retrieval strategy is frozen until that gate passes. Only then does `snapshot_evidence` get written, using exactly the anchors and retrieval modes frozen here.
