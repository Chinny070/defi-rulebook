# Stage 4 — Evidence Snapshot

Scope: turn frozen evidence references into deterministic, fingerprinted snapshots that a later stage can reason over. No adjudication, no challenges, no canonical versions, no GEN economics, no frontend, nothing deployed by Claude.

Contract: `contracts/defi_rulebook.py`, 1835 lines, SHA-256 `7e25ade7eff41f2a16c3e68411cb6117cb3b3d055a14ad32767af92999604c2a`.

Stage 4 answers exactly one question: **"what external evidence should later adjudication evaluate?"** It never decides whether a rule is true.

---

## 1. Retrieval pattern selected

Source-adaptive, using only the official GenLayer web APIs, with equivalence applied to a bounded excerpt. Full API classification is in `STAGE_4_WEB_RETRIEVAL_DECISIONS.md`.

```
frozen evidence (url_key, retrieval_mode, anchors)
        |
        v
gl.nondet.web.get(url)            for GET
gl.nondet.web.render(url,         for RENDER_TEXT
                    mode="text")
gl.nondet.web.render(url,         for RENDER_TEXT_WAIT
   mode="text", wait_after_loaded="2s")
        |
        v
_normalize_text(raw)              deterministic, pure
        |
        v
_extract_excerpt(text, anchors)   bounded window, <= 2000 chars
        |
        v
gl.eq_principle.strict_eq(...)    validators compare the EXCERPT
        |
        v
stored excerpt + fingerprint + status
```

Only the frozen URL is fetched. No link found in a page is followed, no other source is consulted, and no unfrozen URL can enter the path — the contract reads the URL from the frozen evidence record, never from the caller.

---

## 2. Why `strict_eq` over a whole page was rejected

Official documentation states that *"dynamic pages can still vary between validators"* and prescribes extracting the specific facts and validating only those. The official `genlayer-dev` skill says `strict_eq` should *"never"* be used for *"web pages that change between requests."*

Exact equality over a full page would place banners, cookie notices, navigation, counters and analytics text inside the consensus target, producing `Undetermined` results that have nothing to do with the evidence. Narrowing the target to an anchor window is both the documented remedy and a strictly smaller surface.

A source-shape test enforces this structurally: it parses the AST of the `retrieve` closure and fails if the raw response is returned without passing through `_normalize_text` and `_extract_excerpt`.

---

## 3. Snapshot lifecycle

```
UNSNAPSHOTTED
     |
     |  snapshot_evidence()   (case must be EVIDENCE_FROZEN)
     v
  retrieval + normalization + extraction
     |
     +--> SNAPSHOT_COMPLETE   excerpt + fingerprint stored   [terminal]
     |
     +--> SNAPSHOT_FAILED     no excerpt, no fingerprint
               |
               |  retry, up to MAX_SNAPSHOT_ATTEMPTS (3)
               v
        SNAPSHOT_COMPLETE or SNAPSHOT_FAILED
```

**There is no state that makes a failed retrieval look usable.** `SNAPSHOT_FAILED` stores an empty excerpt and an empty fingerprint, contributes nothing to the case snapshot digest, and is excluded from `ready_for_adjudication`.

`SNAPSHOT_COMPLETE` is terminal: a second attempt is rejected with `[ALREADY_SNAPSHOTTED]`, so a snapshot cannot be silently replaced.

Failure reasons: `HTTP_ERROR` (status outside 2xx), `EMPTY_BODY` (`Response.body` was `None`), `EMPTY_CONTENT` (page normalized to nothing), `NO_ANCHOR` (no frozen anchor occurs in the page), `RETRIEVAL_ERROR` (the network call raised — the only transient class).

---

## 4. Why snapshot is a separate transaction

`freeze_evidence` and `snapshot_evidence` are never combined. Freezing is deterministic and must survive a failed, disagreeing or Undetermined retrieval. If the two shared a transaction, every retrieval failure would roll back the freeze and the case would have to be reassembled.

The boundary is: **freeze first (deterministic), snapshot second (non-deterministic, retryable), adjudicate later (non-deterministic, separate again).** A retrieval that fails costs one retry and nothing else.

---

## 5. Normalization algorithm

`_normalize_text(raw)` — pure, no clock, no storage, no model:

1. **NFKC** Unicode normalization, so visually identical text has one representation.
2. Replace every character below `U+0020` and `U+007F` with a space. This also guarantees the internal channel markers can never occur inside content.
3. Replace `U+00A0` (non-breaking space) with a plain space.
4. Collapse every whitespace run to a single `U+0020`.
5. Strip leading and trailing whitespace.

`_extract_excerpt(text, anchors)`:

1. Find the **first frozen anchor** (in frozen order, matched case-insensitively) that occurs in the normalized text. First match wins, so the result never depends on evaluation order.
2. If no anchor matches, return `""` → `NO_ANCHOR`.
3. Window start = `anchor_position - 200` (`EXCERPT_LEAD_CHARS`), clamped at 0, so the sentence introducing the anchor survives.
4. Window end = `start + 2000` (`MAX_EXCERPT_LEN`), clamped to the text length.
5. Slice **by code point, never by byte**.

**Invariant: stored content = hashed content = adjudication content.** The excerpt string written to `snapshot` is the exact string passed to the fingerprint function and the exact string a later stage reads back through `get_evidence_snapshot`. There is no second normalization pass anywhere, and a test asserts the stored excerpt, its length field and the value returned by the list view are all consistent.

---

## 6. Fingerprint

Scheme id **`DRB-SNAP-FP-v1`**, published by `get_config()` and every snapshot view.

Fields are length-prefixed as `<len>:<value>` and joined with `|`, so content can never forge a field boundary:

```
DRB-SNAP-FP-v1 | evidence_id | url_key | retrieval_mode
               | anchors joined by U+001F
               | EXCERPT_LEAD_CHARS | MAX_EXCERPT_LEN
               | excerpt length | excerpt
```

`fingerprint = sha256(preimage_utf8).hexdigest()`

It binds evidence identity, URL identity, retrieval method, extraction parameters and the excerpt itself. Changing any extraction parameter changes every fingerprint it produced — which is the point: a fingerprint is only meaningful together with the parameters that made it.

Raw HTTP responses are **not** fingerprinted. A test recomputes the fingerprint independently from this documented format, so contract and documentation cannot drift apart silently.

**What the fingerprint proves:** *this is the exact content GenLayer evaluated.*
**What it does not prove:** that the webpage is immutable, or that it said the same thing before or after `retrieved_at`.

### Case-level digest

`get_case_snapshot_digest(case_id)` derives a digest over the case fingerprint plus every completed snapshot fingerprint in frozen order. It is computed on read, never stored. Stage 5 will bind adjudication output to it alongside the case fingerprint, so a verdict cannot be replayed against a different evidence set.

---

## 7. URL mutability — what is and is not guaranteed

**V1 guarantees:** the URL reference is frozen; the retrieval mode and anchors are frozen; the excerpt is stored verbatim; the fingerprint binds all of it; and the retrieval time is recorded.

**V1 does not guarantee:** website immutability, archival preservation, or that re-fetching the URL later reproduces the same excerpt.

A page can change after a snapshot. When it does, the record self-reports as historical: anyone can re-retrieve and observe that the excerpt no longer matches. That is honest and achievable; permanence is not claimed anywhere in the contract, the views, or this document.

---

## 8. Storage additions

All fields **appended**; no Stage 3 field was reordered or removed.

`EvidenceRecord` gains: `snapshot_status`, `snapshot_method`, `excerpt_length`, `snapshot_attempts`, `failure_reason`. The pre-existing `snapshot`, `snapshot_fingerprint` and `snapshot_at` are now written by this stage.

`CaseRecord` gains: `snapshot_ok_count`, `snapshot_failed_count`. These track the **current status of each evidence item**, not attempts, so a retry that finally succeeds moves the item between buckets rather than being counted twice.

**No separate `EvidenceSnapshotRecord` was created.** `EvidenceRecord` already carried the three snapshot fields from the Stage 2 schema, so a parallel record would have duplicated the excerpt in storage or split one fact across two places. The brief's snapshot shape is delivered as a *view* (`get_evidence_snapshot`) with exactly the requested fields, which keeps the API clean without paying for duplicate storage.

---

## 9. ABI changes

**New write (1):** `snapshot_evidence(evidence_id) -> str` (returns the resulting status)

**New views (4):** `get_evidence_snapshot(evidence_id)`, `list_case_snapshots(case_id, offset, limit)`, `get_case_snapshot_status(case_id)`, `get_case_snapshot_digest(case_id)`

Totals: **10 writes, 17 views.** No payable methods. `list_case_snapshots` is offset/limit paginated and clamped like every other list view.

`snapshot_evidence` is **permissionless**: every input is already frozen, so anyone may advance a frozen case toward readiness. There is nothing left for a caller to influence.

No adjudication, resolution or finalization method was added.

---

## 10. Guards

- Case must be `EVIDENCE_FROZEN` → `[NOT_FROZEN]`
- Evidence must be in that case's frozen set → `[NOT_FROZEN]`
- Already complete → `[ALREADY_SNAPSHOTTED]`
- Attempts exhausted → `[SNAPSHOT_ATTEMPTS]`
- Unknown evidence → `[EVIDENCE_NOT_FOUND]`

Snapshotting adds and removes nothing: the frozen evidence id list, the case fingerprint, and every piece of submitter-supplied metadata are unchanged by it, and a test asserts that.

---

## 11. Known limitations

1. **Convergence on real sites is unmeasured.** Tests use mocked pages; they prove the mechanism, not real-world validator agreement. Measuring it requires a deployed contract.
2. **`Undetermined` cannot be eliminated**, only made less likely. This design minimizes avoidable cases and makes the rest retryable.
3. **Anchor extraction is first-match.** A page mentioning an anchor in an unrelated section earlier than the relevant one yields the wrong window. The mitigation is that anchors are public and reproducible, so a bad excerpt is visible and challengeable.
4. **A 2000-character window may truncate** a commitment stated across a long passage.
5. **`EXCERPT_LEAD_CHARS` and `MAX_EXCERPT_LEN` are tuning parameters** bound into every fingerprint; changing them invalidates comparisons with earlier snapshots.
6. **No redirect or timeout semantics are documented**, so both are handled conservatively as failures.
7. **The snapshot is a moment, not an archive.** See §7.
8. **A transient `RETRIEVAL_ERROR` and a permanent one are indistinguishable** to the contract; both consume an attempt.
9. **`time.time()` still raises linter warning W002** — a documented false positive.

---

## 12. Stage 5 preparation

In place for adjudication: frozen inputs that cannot change; bounded untrusted excerpts, each labelled as untrusted; per-evidence fingerprints; a case-level snapshot digest to bind a verdict to an exact evidence set; a `ready_for_adjudication` signal; and a clear separation between system-controlled fields and external text.

Stage 5 will add the prompt frame, the equivalence design for the model call, and the strict deterministic validator. Nothing in Stage 4 decides any part of a verdict.
