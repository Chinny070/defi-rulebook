# DEFI RULEBOOK

Challengeable Protocol Commitments.

Turn protocol documentation into something users can challenge.

A challengeable, versioned, evidence-backed source of truth for DeFi protocol
commitments, built as a GenLayer Intelligent Contract plus a read-first frontend.

**Status: Stage 9 (Rule Explorer frontend).** Nothing
is deployed by Claude and no live GEN has moved. The contract implements the
full lifecycle: protocol registry, rule shells, RULE_CLAIM and RULE_DRIFT cases,
evidence submission and deterministic freeze, evidence snapshots through the
official GenLayer web APIs, semantic adjudication, challenges with
re-adjudication, finalization, immutable canonical rule versions, native GEN
proposer bonds with a safe payout lifecycle, and a bounded integration surface.
The Rule Explorer frontend reads it directly - no backend, no indexer.

- Architecture, audit and roadmap: [docs/STAGE_1_ARCHITECTURE_AND_AUDIT.md](docs/STAGE_1_ARCHITECTURE_AND_AUDIT.md)
- Runtime compatibility: [docs/STAGE_2_RUNTIME_COMPATIBILITY.md](docs/STAGE_2_RUNTIME_COMPATIBILITY.md)
- Contract foundation: [docs/STAGE_2_CONTRACT_FOUNDATION.md](docs/STAGE_2_CONTRACT_FOUNDATION.md)
- Deterministic lifecycle: [docs/STAGE_3_DETERMINISTIC_LIFECYCLE.md](docs/STAGE_3_DETERMINISTIC_LIFECYCLE.md)
- Web retrieval decisions: [docs/STAGE_4_WEB_RETRIEVAL_DECISIONS.md](docs/STAGE_4_WEB_RETRIEVAL_DECISIONS.md)
- Evidence snapshots: [docs/STAGE_4_EVIDENCE_SNAPSHOT.md](docs/STAGE_4_EVIDENCE_SNAPSHOT.md)
- Semantic adjudication: [docs/STAGE_5_ADJUDICATION.md](docs/STAGE_5_ADJUDICATION.md)
- Challenges and versioning: [docs/STAGE_6_CHALLENGES_AND_VERSIONING.md](docs/STAGE_6_CHALLENGES_AND_VERSIONING.md)
- Native GEN economics: [docs/STAGE_7_NATIVE_GEN_ECONOMICS.md](docs/STAGE_7_NATIVE_GEN_ECONOMICS.md)
- Production readiness: [docs/STAGE_8_PRODUCTION_READINESS.md](docs/STAGE_8_PRODUCTION_READINESS.md)
- Frontend architecture: [docs/STAGE_9_FRONTEND_ARCHITECTURE.md](docs/STAGE_9_FRONTEND_ARCHITECTURE.md)

```
contracts/   defi_rulebook.py - canonical production Intelligent Contract
docs/        architecture and design records
tests/       direct-mode and source-shape tests
frontend/    Rule Explorer (React + TypeScript + genlayer-js)
```
