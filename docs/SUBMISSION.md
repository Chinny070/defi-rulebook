# DEFI RULEBOOK — GenLayer Portal Submission Pack

Copy/paste-ready. All live claims are accurate to the RC3 StudioNet run; time-gated items are disclosed, never overstated.

- **Live contract (RC3):** `0xD4C6d6B5002ADdC8386510687fA799494AA86d44`
- **Network:** GenLayer StudioNet
- **GitHub:** https://github.com/Chinny070/defi-rulebook
- **Live website:** https://frontend-eight-alpha-82.vercel.app

---

## Project name
DEFI RULEBOOK

## One-liner
Turn protocol documentation into something users can challenge — a live, versioned, evidence-backed source of truth for the rules DeFi protocols actually operate under, adjudicated by GenLayer.

## Short description
DeFi rules live scattered across docs, governance and announcements that go stale and conflict. DEFI RULEBOOK lets anyone stake GEN to claim what a protocol's rule is — or that it has drifted — backed by frozen public evidence. GenLayer validators retrieve and adjudicate that evidence; a deterministic contract validates the verdict, runs a challenge window, and mints an immutable, versioned canonical rule anyone can read without a wallet.

## Full description
DeFi protocol rules — fees, pause windows, liquidation thresholds, oracle dependencies — are documented across many public sources that routinely disagree and go out of date. The real problem isn't finding a document; it's deciding which public evidence actually establishes the rule a user can rely on right now.

DEFI RULEBOOK makes that decision accountable. A reporter opens a **RULE_CLAIM** (this evidence establishes the rule) or a **RULE_DRIFT** (newer evidence shows the canonical rule is stale), locks a real GEN bond, and submits a set of evidence URLs. The contract freezes the exact evidence set, then GenLayer retrieves each source through its official web mechanism and stores a bounded, fingerprinted excerpt. Validators adjudicate the frozen excerpts over seven fixed semantic dimensions (source authority, independence, governance legitimacy, temporal validity, claim support, contradictory evidence, and — for drift — existing-rule consistency). A strict deterministic gate re-derives the decision from those dimensions and rejects anything inconsistent, so the model never has final authority. A 72-hour challenge window lets any non-reporter contest the verdict on a named ground, triggering re-adjudication over the same frozen evidence with append-only history. Only after finalization does an immutable, versioned canonical rule exist, and the bond is refunded or slashed accordingly.

The result is a public Rule Explorer where anyone — no wallet needed — can see what rule a protocol is claimed to follow, the frozen evidence behind it, the validator findings, the full challenge history, and the bond at stake. Wallets, risk dashboards, DAO tooling and integrators can read the same canonical rules and dispute status directly from contract state, with no backend.

## Problem solved
Fragmented, stale and conflicting public information about DeFi protocol rules. Users and integrators can't easily tell which evidence establishes the rule that's actually operative, and there is no neutral, versioned, challengeable record of it.

## How it works
Register a (clearly community-maintained) protocol namespace → propose a rule → open a RULE_CLAIM/RULE_DRIFT → lock a 1 GEN bond → submit public evidence URLs → freeze the evidence set → GenLayer snapshots each source (bounded, anchor-extracted, fingerprinted) → validators adjudicate over seven dimensions → the deterministic gate validates and records a verdict → a 72-hour challenge window allows named-ground challenges and re-adjudication → finalization mints an immutable versioned canonical rule and settles the bond.

## Why GenLayer is essential
Ordinary smart contracts handle the numbers, deadlines, bonds, versioning and challenge windows perfectly — but they cannot read heterogeneous public evidence and judge whether it establishes a protocol commitment. DEFI RULEBOOK places GenLayer exactly at that interpretive boundary: validators reach consensus over structured semantic dimensions on frozen evidence, and the deterministic contract governs everything else. GenLayer is the trust layer for interpretation — not a chatbot over docs. (Live testing even hardened this boundary: two prompt-semantics defects were surfaced by real validators and fixed, and in both cases invalid model output rolled back with zero partial state.)

## Reusable primitive — Challengeable Protocol Commitments
`Protocol → Rule → immutable RuleVersion(v1→vN) → Case → frozen Evidence → Verdict → Challenge → Bond`. Any project needing an evidence-backed, challengeable, versioned record of an external fact — not just DeFi rules — can reuse the pattern: freeze evidence deterministically, adjudicate it semantically under a fixed dimension set with a strict deterministic gate, make it economically challengeable, and version the outcome immutably.

## How to test (steward-verifiable)
1. Open the live website (no wallet needed) and go to the protocol `drb-live-test-1`.
2. Open rule `r_1` ("Swap fee") → case `c_1`. Observe it is `RE_ADJUDICATED`, awaiting the 72-hour challenge window before finalization.
3. Open the evidence `e_1` — the frozen Uniswap-docs source, its GET retrieval, anchors, the bounded excerpt and its fingerprint (`36e07531…`). Recompute `sha256` over the displayed excerpt to reproduce it.
4. Open the verdicts: `v_1 ESTABLISHED`, then `v_2 ESTABLISHED` (replacing `v_1`) — append-only.
5. Open the challenge `ch_1` (`TEMPORAL_VALIDITY_ERROR`) → `REJECTED`, resulting in `v_2`.
6. Read on-chain directly at `0xD4C6d6B5002ADdC8386510687fA799494AA86d44` (StudioNet): `get_case("c_1")`, `list_case_verdicts("c_1",0,10)`, `list_case_challenges("c_1",0,10)`, `get_evidence_snapshot("e_1")`, `get_bond_state("c_1")` — the site's data matches contract state exactly, with no backend.

## Steward-verifiable outcome
A steward can verify that a protocol-rule claim was backed by frozen live public evidence, retrieved and adjudicated by GenLayer validators, challenged, re-adjudicated, and preserved through append-only verdict history, with a real GEN bond locked under the case — all readable without a wallet and directly from contract state.

Disclosure: the current RC3 case is awaiting the production 72-hour challenge window before canonical finalization. This security window was deliberately not shortened or bypassed for the submission; finalization, canonical RuleVersion minting, GEN payout and the RULE_DRIFT lifecycle are implemented and test-covered (346 tests) and will occur once the window elapses.

## Known limitations / live status
- Live-verified: registration, rule, RULE_CLAIM, 1 GEN bond, evidence submission, freeze, GenLayer snapshot (first-try convergence), adjudication → ESTABLISHED, challenge, re-adjudication → ESTABLISHED, challenge REJECTED, append-only verdict history, clean rollback on Undetermined and on malformed output, authoritative-state revalidation.
- Time-gated (not yet live): finalization, canonical RuleVersion v1, this case's GEN payout, RULE_DRIFT lifecycle, RuleVersion v2.
- Protocol identity is community-maintained, not verified; establishing a commitment is not a guarantee the protocol honors it; adjudication sees only frozen evidence; no challenger bonds in V1.

## Recommended Portal tags
From the project's domain, the strongest tags are: **DeFi**, **Oracle / Web Data**, **Governance**, **Consensus / Adjudication**, **Transparency**, **Developer Tools / Integration**. If the Portal uses a fixed tag list, select the closest available among those; do not invent tags.

---

## Demo video plan (60–90s, real frontend + RC3)

| Time | Screen action | Voiceover | On-screen text |
|---|---|---|---|
| 0–10s | Landing page | "DeFi rules live across docs, governance and announcements. Which one should users actually rely on?" | *DEFI RULEBOOK* |
| 10–20s | Rule Explorer → protocol → rule `r_1` | "DEFI RULEBOOK turns those claims into a challengeable, versioned record." | *Challengeable Protocol Commitments* |
| 20–35s | Case `c_1` → evidence `e_1`, frozen excerpt + fingerprint | "A reporter staked GEN and froze public evidence. GenLayer retrieved and fingerprinted it on-chain." | *Frozen evidence · fingerprinted* |
| 35–50s | Verdict `v_1`, seven dimension findings | "GenLayer validators adjudicated the evidence across seven dimensions and reached consensus: ESTABLISHED." | *GenLayer verdict* |
| 50–65s | Challenge `ch_1` → re-adjudication → `v_2` | "Anyone can challenge. Re-adjudication ran over the same frozen evidence — and the verdict held." | *Challenged · re-adjudicated* |
| 65–75s | Verdict history + bond | "Verdict history is append-only, with a real GEN bond under the case." | *Append-only · 1 GEN bonded* |
| 75–90s | Methodology / address | "GenLayer is the trust layer for interpreting evidence. Finalization is now respecting a real 72-hour dispute window." | *StudioNet · 0xD4C6…6d44* |

### Voiceover (continuous)
"DeFi rules live across documentation, governance and announcements — which one should users actually rely on? DEFI RULEBOOK turns those claims into a challengeable, versioned record. A reporter staked GEN and froze public evidence; GenLayer retrieved and fingerprinted it on-chain, then validators adjudicated it across seven dimensions and reached consensus: established. Anyone can challenge — re-adjudication ran over the same frozen evidence, and the verdict held, preserved in append-only history with a real GEN bond at stake. GenLayer is the trust layer for interpreting evidence, and finalization is respecting a real 72-hour dispute window before the rule becomes canonical."

---

## X announcement (draft)

> DeFi rules are scattered across docs, governance and announcements — and they go stale. Which one can users actually rely on?
>
> DEFI RULEBOOK lets anyone stake GEN to claim a protocol's rule from public evidence, then @GenLayer validators retrieve and adjudicate that evidence on-chain. Claims can be challenged, re-adjudicated and versioned.
>
> Live on StudioNet: a claim was evidenced, adjudicated ESTABLISHED, challenged, re-adjudicated, and kept in append-only history with a real bond locked. The 72h dispute window is running before finalization — no shortcuts.
>
> Explore it (no wallet needed): https://frontend-eight-alpha-82.vercel.app
