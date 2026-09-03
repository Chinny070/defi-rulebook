# DEFI RULEBOOK

**Turn protocol documentation into something users can challenge.**

A challengeable, versioned, evidence-backed source of truth for the rules users believe a DeFi protocol currently operates under — built as a GenLayer Intelligent Contract plus a read-first Rule Explorer, with **no backend**.

- **Canonical contract (RC3):** `0xD4C6d6B5002ADdC8386510687fA799494AA86d44`
- **Network:** GenLayer StudioNet
- **Live Rule Explorer:** https://defi-rulebook.vercel.app
- **GitHub:** https://github.com/Chinny070/defi-rulebook
- **Contract version:** `0.10.0-rc3` · **source SHA-256:** `29307e7e8b94b8abd5239d184f41d7ec61f5ef03ccc8813b2eb7ecbe76ec7de6`

> Superseded test deployments (do not use): RC1 `0x187Ce71645Dd2a9FDa660b0820874d9ab34821aB`, RC2 `0x969451745c8c1F7f5baD93b3D202a8300936Eb96`. See `docs/STAGE_10B_LIVE_VERIFICATION_REPORT.md`.

---

## The problem

DeFi protocol rules — fee schedules, pause windows, liquidation thresholds, oracle dependencies — are scattered across documentation, governance proposals, governance results, forum posts, contract changes and security announcements. Those sources go stale, conflict, and get superseded. Users and integrators end up relying on whichever they happened to find.

The hard part is not *finding* documents. It is deciding: **which public evidence actually establishes the rule a user can reasonably rely on right now?**

## What DEFI RULEBOOK does

Anyone can assert that authoritative public evidence establishes a protocol's rule (a **RULE_CLAIM**), or that newer evidence shows the canonical rule has gone stale (a **RULE_DRIFT**). The claim is backed by a GEN bond and a frozen set of evidence URLs. GenLayer validators retrieve and reason over that frozen evidence across seven fixed semantic dimensions; a strict deterministic contract then validates the result, runs a challenge window, and — only after finalization — mints an immutable, versioned canonical rule.

The reusable primitive is **Challengeable Protocol Commitments**: `Protocol → Rule → immutable RuleVersion(v1→vN) → Case → frozen Evidence → Verdict → Challenge → Bond`, every arrow traceable through bounded contract reads.

## Why GenLayer is essential

Deterministic contracts are excellent at numbers, deadlines, signatures, bonds, state transitions, version pointers, challenge windows and payouts — but they cannot interpret heterogeneous public evidence and decide whether it *establishes* a protocol commitment. DEFI RULEBOOK uses GenLayer exactly at that boundary: validators examine frozen public evidence and reach consensus over structured semantic dimensions, and the deterministic contract governs everything else (challenge, re-adjudication, versioning, finalization, economics). GenLayer is the trust layer for the interpretive step — this is not "AI reads docs."

## Architecture

```
public web evidence
      -> evidence submission        (deterministic)
      -> freeze                     (deterministic; binds the exact evidence set)
      -> GenLayer web retrieval / snapshot   (non-deterministic, bounded, anchor-extracted)
      -> semantic adjudication      (non-deterministic; 7 dimensions)
      -> deterministic verdict validation + decision gate   (deterministic; authoritative)
      -> challenge / re-adjudication (deterministic window; non-deterministic re-run)
      -> finalization               (deterministic; after the challenge window)
      -> versioned canonical rule   (deterministic; immutable, append-only)
      -> GEN bond settlement        (deterministic)
```

Two steps are semantic (snapshot retrieval, adjudication); everything else is deterministic. The model never sees bond amounts, addresses, or economics; its output is re-derived and cross-checked by the contract before any state changes, and malformed or non-converged output rolls back atomically.

## Repository layout

```
contracts/defi_rulebook.py   canonical RC3 Intelligent Contract (frozen)
frontend/                    React + TypeScript + Vite Rule Explorer (genlayer-js, no backend)
docs/                        architecture, per-stage records, runtime audits, live verification
tests/                       346 direct-mode + source-shape tests
```

## Contract at a glance

- **46 methods** — 16 write, 30 view; `lock_bond` is the only payable method; constructor takes no parameters.
- **Case types:** `RULE_CLAIM`, `RULE_DRIFT` (no generic amendment).
- **Seven dimensions:** SOURCE_AUTHORITY, SOURCE_INDEPENDENCE, GOVERNANCE_LEGITIMACY, TEMPORAL_VALIDITY, CLAIM_SUPPORT, CONTRADICTORY_EVIDENCE, and (drift only) EXISTING_RULE_CONSISTENCY.
- **Economics:** fixed 1 GEN proposer bond; refund on `ESTABLISHED`/`INVALID`; slash 50% (claim) / 25% (drift) on `NOT_ESTABLISHED`; challenger bonds not in V1.
- **Windows:** 7-day evidence window, 72-hour challenge window.

### Evidence lifecycle
submit → freeze (immutable set + case fingerprint) → snapshot each item (official GenLayer web retrieval, normalized, anchor-extracted ≤2000-char excerpt, fingerprinted) → adjudicate.

### Challenge lifecycle
Any non-reporter may challenge a proposed verdict on one of eight named grounds within 72h; resolution re-adjudicates the **same frozen evidence** and appends a new verdict (`replaces_verdict_id`), never overwriting history; finalization occurs after the window with no open challenge.

### Integration reads (for other apps)
`get_current_rules(protocol, offset, limit)` (canonical rules only), `get_dispute_status(rule_id)`, `list_rule_versions`, `get_rule_version`, `get_verdict`, `list_case_evidence`, `get_evidence_snapshot`, `get_bond_state` — all bounded and paginated, consumable directly from contract state with no backend.

## Live verification status (StudioNet, RC3)

**Live-verified:** deployment + config reads; protocol registration; rule creation; RULE_CLAIM; real 1 GEN bond lock; live public-evidence submission; freeze; GenLayer web retrieval + snapshot (converged first-try); semantic adjudication → `ESTABLISHED`; challenge; re-adjudication → `ESTABLISHED` → challenge `REJECTED`; append-only verdict history (`v_1`, `v_2 replaces v_1`); clean atomic rollback on both `Undetermined` and malformed output; authoritative-state revalidation overriding misleading receipts.

**Time-gated (implemented + test-covered, not yet live):** finalization of the current case, canonical RuleVersion v1 mint, its GEN payout, the RULE_DRIFT live lifecycle, and canonical RuleVersion v2. The current live case is `RE_ADJUDICATED` and is **awaiting the production 72-hour challenge window before finalization — this window was deliberately not shortened or bypassed.**

`v_1`/`v_2` above are **verdict** history, not canonical RuleVersions; no canonical RuleVersion is minted until finalization.

## Setup

**Contract** (validate / test locally; deployment is manual by the maintainer):
```bash
pip install genvm-linter genlayer-test
genvm-lint check contracts/defi_rulebook.py
python -m pytest tests -q
```

**Frontend:**
```bash
cd frontend
cp .env.example .env      # already points at the RC3 address on StudioNet
npm install
npm run dev               # or: npm run build
```

## Known limitations

- Protocol identity is community-maintained, not cryptographically verified; every protocol read reports `officially_verified: false`.
- Establishing a commitment proves what evidence supports, not that the protocol will honor it or that code implements it.
- Adjudication sees only frozen evidence; cherry-picking is bounded by challenges, not eliminated.
- A snapshot is a bounded excerpt of a page at retrieval time, not an archive; digests detect divergence, they do not prevent it.
- `Undetermined` consensus is minimized, not eliminated; it rolls back cleanly and is retryable.
- Queued native transfers (`emit_transfer`) report no delivery acknowledgement to the contract.
- No challenger bonds in V1.

## Security considerations

- The adjudication model never receives economic or identity signals; retrieved page text is treated as untrusted data and cannot alter contract state.
- All list views are bounded/paginated; no unbounded reads.
- The owner's only privilege is emergency pause, which cannot rewrite rules, alter verdicts, seize bonds, or bypass challenge windows.
- Never commit secrets; `frontend/.env` is gitignored — use `frontend/.env.example`.

## Documentation

Architecture and audits in `docs/`: `STAGE_1_ARCHITECTURE_AND_AUDIT.md` (design), `STAGE_8_PRODUCTION_READINESS.md` (security/integration), `STAGE_10A_PRODUCTION_RELEASE_AUDIT.md` (release gate), `RC2_PROMPT_POLARITY_FIX.md` / `RC3_DECISION_DERIVATION_FIX.md` (live-hardening fixes), and `STAGE_10B_LIVE_VERIFICATION_REPORT.md` (the live StudioNet run).
