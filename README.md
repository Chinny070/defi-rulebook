# DEFI RULEBOOK

Challengeable Protocol Commitments.

Turn protocol documentation into something users can challenge.

A challengeable, versioned, evidence-backed source of truth for DeFi protocol
commitments, built as a GenLayer Intelligent Contract plus a read-first frontend.

**Status: Stage 4 (evidence snapshots) only.** Nothing is deployed by Claude.
The contract implements the protocol registry, rule shells, RULE_CLAIM and
RULE_DRIFT case creation, evidence submission, deterministic evidence freeze,
and evidence snapshots retrieved through the official GenLayer web APIs.
No adjudication, no challenges, no canonical rule versions, no payouts, no
frontend.

- Architecture, audit and roadmap: [docs/STAGE_1_ARCHITECTURE_AND_AUDIT.md](docs/STAGE_1_ARCHITECTURE_AND_AUDIT.md)
- Runtime compatibility: [docs/STAGE_2_RUNTIME_COMPATIBILITY.md](docs/STAGE_2_RUNTIME_COMPATIBILITY.md)
- Contract foundation: [docs/STAGE_2_CONTRACT_FOUNDATION.md](docs/STAGE_2_CONTRACT_FOUNDATION.md)
- Deterministic lifecycle: [docs/STAGE_3_DETERMINISTIC_LIFECYCLE.md](docs/STAGE_3_DETERMINISTIC_LIFECYCLE.md)
- Web retrieval decisions: [docs/STAGE_4_WEB_RETRIEVAL_DECISIONS.md](docs/STAGE_4_WEB_RETRIEVAL_DECISIONS.md)
- Evidence snapshots: [docs/STAGE_4_EVIDENCE_SNAPSHOT.md](docs/STAGE_4_EVIDENCE_SNAPSHOT.md)

```
contracts/   defi_rulebook.py - canonical production Intelligent Contract
docs/        architecture and design records
tests/       direct-mode and source-shape tests
```
