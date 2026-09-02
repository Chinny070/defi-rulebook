# Stage 7 — Native GEN Bonds, Economic Security and Payout Lifecycle

Scope: proposer bonds in native GEN, the payout lifecycle, and the economic asymmetry between RULE_CLAIM and RULE_DRIFT. No frontend, nothing deployed by Claude, no live GEN moved.

Contract: `contracts/defi_rulebook.py`, 3058 lines, SHA-256 `883ffbfb8b0549acb5302ac64a831bd4550043294e0cd070f0b9de3fcd98e1c0`.

---

## 1. Bond philosophy

A bond is **not** voting power, not a way to buy a better outcome, and not an input to GenLayer's judgement. It is accountability for occupying a rule's attention and a validator's time.

Posting one says: *"I believe this evidence-backed interpretation is strong enough that I will accept economic loss if it is not established."*

Three consequences follow, and each is enforced structurally rather than by convention:

- **The amount is fixed by contract configuration.** A caller cannot choose it, so a bond carries no signal about conviction and cannot be scaled to buy influence.
- **The adjudicator never sees it.** Not "is told to ignore it" — it is not in the prompt at all.
- **Recipients are frozen at disposition time.** No payout call can redirect a payment.

---

## 2. Runtime findings — how GEN actually moves

Read directly from the SDK the pinned runner resolves (`genlayer/gl/genvm_contracts.py`), not inferred from another project.

| Finding | Classification |
|---|---|
| `gl.get_contract_at(address).emit_transfer(*, value: u256, on='finalized')` is the typed transfer API | **CONFIRMED** (SDK source + docstring) |
| `emit_transfer` raises `ValueError` when `value <= 0` | **CONFIRMED** (SDK source) |
| The transfer is a queued `PostMessage`, **not** a synchronous call | **CONFIRMED** (SDK source: `_ContractAtEmitMethod` posts a message) |
| `on='finalized'` is the default and the documented safe choice — the docstring warns that value transfers `on='accepted'` "may lead to undesired results" | **CONFIRMED** |
| The receiver "may catch it with `gl.Contract.__receive__`, so users may need to supply non-zero gas" | **CONFIRMED (documented caveat)** |
| Cross-contract operations including `PostMessage` are **forbidden inside nondet blocks** | **CONFIRMED** (harness raises `SystemError: 6`) |
| `@gl.public.write.payable` + `gl.message.value` receive value | **CONFIRMED** (docs + executed in direct mode) |
| Whether a queued transfer to an EOA can fail after finalization, and whether anything reports that | **UNKNOWN** |
| Actual balance movement | **UNKNOWN locally** — direct mode has no `PostMessage` handler, so an emitted transfer is accepted but moves no balance in tests |

**This closes the open question carried since Stage 1.** The old project's `@gl.evm.contract_interface` shim is *not* the documented path; `get_contract_at(...).emit_transfer(...)` is, and it is asynchronous. A source-shape test now bans the shim.

### What that means for failure handling

Because the transfer is a queued message that returns nothing:

- There is **no synchronous failure** to catch, so `try/except` around a transfer would be theatre.
- There is **no failure signal** to persist, so a `PAYOUT_FAILED` state is unreachable by construction — exactly the conclusion the Stage 1 addendum reached for a different reason, now confirmed by the mechanism rather than assumed.
- A **retry state would be unsafe**: since nothing reports failure, a retryable payout is indistinguishable from a double payout.

So the design is: **decide, freeze, mark settled, emit — once.** If anything in the transaction reverts, the whole thing unwinds and no message is posted, because `on='finalized'` dispatches only when the transaction finalizes.

**Residual risk, stated plainly:** if a queued transfer fails after finalization, the contract records `SETTLED` for a payment the chain did not deliver, and has no way to know. There is no safe automatic recovery for this, and inventing one would be worse than acknowledging it. See the manual verification checklist in §9.

---

## 3. Bond state machine

```
NONE
  |  lock_bond  (payable, exact amount, case must be EVIDENCE_OPEN)
  v
LOCKED
  |  case reaches a terminal outcome -> _dispose_bond freezes amounts and recipients
  |
  +--> REFUNDABLE   (FINALIZED / INVALIDATED / ABANDONED)
  |
  +--> SLASHABLE    (REJECTED: partial slash + partial refund)
          |
          |  execute_payout  (permissionless, allowed while paused)
          v
       SETTLED   [terminal]
```

**Deviation from the brief, for approval: there is no `PAYOUT_READY` state.** `REFUNDABLE` and `SLASHABLE` *are* the payout-ready states — the recipients and both amounts are already frozen when a case closes, and nothing further needs arming. Inserting `PAYOUT_READY` would require either a second no-op transaction or a status written and cleared inside one transaction, where it is never observable. This is the same reasoning that kept `ADJUDICATION_RUNNING` (Stage 5) and `CHALLENGE_WINDOW` (Stage 6) out. `get_bond_state` exposes `payout_owed` as a derived fact instead.

`PAYOUT_FAILED` is absent for the reason in §2, and a test asserts it is not in the vocabulary.

---

## 4. Locking

`lock_bond(case_id)` — **the only payable method in the contract.** A test asserts `@gl.public.write.payable` and `gl.message.value` each appear exactly once, and that the only payable function is this one.

- `gl.message.value` must equal `case_bond` **exactly**; underpayment and overpayment both revert with `[BOND_AMOUNT]`. Zero reverts too.
- Only while the case is `EVIDENCE_OPEN` (`[BOND_LOCK_CLOSED]` otherwise), so a bond is always in place before any evidence is frozen.
- One bond per case (`[BOND_EXISTS]`).
- Blocked while paused — a bond is new exposure.

**`freeze_evidence` now requires a locked bond** (`[BOND_REQUIRED]`). This is what makes the economics real rather than decorative: no case can consume snapshot retrieval, validator time or a rule's lock without accountability behind it.

---

## 5. Outcomes

| Case outcome | Bond state | Refund | Slash |
|---|---|---|---|
| `FINALIZED` (ESTABLISHED, version minted) | REFUNDABLE | 100% | 0 |
| `REJECTED` (NOT_ESTABLISHED) | SLASHABLE | remainder | 50% claim / 25% drift |
| `INVALIDATED` (stale binding) | REFUNDABLE | 100% | 0 |
| `ABANDONED` (evidence window lapsed) | REFUNDABLE | 100% | 0 |

Disposition happens in `_dispose_bond`, called from the single case-closing path, so every terminal outcome settles the bond exactly once and no outcome can forget to.

### INVALID → full refund

`INVALID` is a structural failure: an impossible case, a stale binding, a malformed lifecycle. **The proposer should not lose funds because the system could not reach a substantive answer**, so it refunds in full. This is deliberately *not* an escape hatch: Stage 5's validator rejects a model-declared `INVALID` outright, and every structural condition it could name is checked deterministically before the prompt is built. Uncertainty is `NOT_ESTABLISHED`, which is slashable.

---

## 6. RULE_CLAIM vs RULE_DRIFT economics

The brief asked for a choice with reasoning between:

- **Option A — same economics.** Simple, but wrong on the merits. A drift reporter and a first-claim proposer are not doing the same thing.
- **Option B — reduced slash for drift.** **Chosen.**
- **Option C — refund-only for drift.** Rejected: a zero-downside path makes drift spam free against every high-profile protocol, and drift is exactly the recurring action the product depends on.

**Chosen: Option B, 50% slash on a failed RULE_CLAIM, 25% on a failed RULE_DRIFT.**

Reasoning. A drift reporter is doing unpaid public-good work — checking whether public information has gone stale — and is held to a *higher* evidential bar than a first claim: Stage 5's gate blocks drift on `TEMPORAL_VALIDITY = UNCLEAR`, where a first claim may pass. Charging the full rate for a good-faith drift report that lands on UNCLEAR would suppress the behaviour the Rulebook needs most. A quarter of the bond still makes frivolous filing clearly negative-EV.

This matches the Stage 1 approved position. It is two rates over one base amount: no tiers, no curves, no emissions, no reputation. A test asserts the drift slash is strictly less than the claim slash rather than just checking a constant.

---

## 7. Payout safety

`execute_payout(case_id)` — permissionless, and **allowed while paused**, because pause must never trap user funds.

| Requirement | How |
|---|---|
| Recipient stored in bond state | `refund_recipient` and `slash_recipient` are written at disposition and read back at payout |
| Amount stored in bond state | `refund_amount` and `slash_amount`, likewise |
| No arbitrary recipient argument | The signature is `(case_id)` only — asserted by a test that inspects the AST |
| No double payout | `SETTLED` is written **before** the transfers and is terminal; a second call gets `[BOND_NOT_PAYABLE]` |
| No recipient substitution | Recipients derive from `case.reporter` and `sink_address` frozen at disposition; changing `sink_address` later cannot redirect an owed payout |
| No cross-case payout | The bond is reached only through `case.bond_id`; a test finalizes one case and asserts the other's bond is untouched |
| Atomicity | If anything in the transaction reverts, the state write unwinds with it and no message is posted |

A slash pays **two** recipients: the slashed portion to the sink and the remainder back to the proposer. Both are emitted in the same transaction, each only when its amount is non-zero (`emit_transfer` rejects zero).

---

## 8. Adjudication cannot see the economics

Structural, not instructional:

- `_build_prompt` reads no bond, address or economic field. An AST test fails if it *accesses* any of them.
- A behavioural test builds the prompt, then multiplies `case_bond` by ~1000 and sets both slash rates to extremes, rebuilds, and asserts **the two prompts are byte-identical**.
- Another asserts the prompt contains no `0x`, no bond amount, and no address text at all.

---

## 9. Manual verification checklist (for a future live stage)

Local tests cannot prove GEN actually moves — direct mode accepts `emit_transfer` and moves no balance. When the contract is eventually deployed, verify in this order:

1. `lock_bond` with the exact bond: transaction succeeds, contract balance increases by the bond.
2. `lock_bond` with a wrong amount: reverts, balance unchanged.
3. Finalize an ESTABLISHED case, then `execute_payout`: the **proposer's** balance increases by the full bond and the contract's decreases.
4. Finalize a REJECTED claim, then `execute_payout`: the sink receives 50%, the proposer 50%, in the same transaction.
5. Repeat 4 for a REJECTED drift: sink 25%, proposer 75%.
6. Call `execute_payout` a second time: reverts with `[BOND_NOT_PAYABLE]`, no further balance change.
7. Pause, then `execute_payout` on an owed bond: succeeds.
8. **Confirm the queued transfer actually lands** — check recipient balances after finalization, not just the transaction receipt. This is the one behaviour with no local proof.

---

## 10. ABI and storage

**New writes (2):** `lock_bond` (payable), `execute_payout`
**New views (3):** `get_bond_state`, `list_case_bonds`, `get_economic_config`

Totals: **16 writes, 28 views**, exactly one payable.

`confirm_payout` was **not** added: it would only make sense if a transfer reported success or failure, and it does not.

**Storage, appended only:** `BondRecord` gains `refund_recipient`, `slash_recipient`, `locked_at`. No field was reordered or removed. `BOND_ROLES` narrowed to `("PROPOSER",)` and `BOND_STATES` replaced per §3 — both are value tuples, not storage layout.

---

## 11. Known limitations

1. **Balance movement is unverified locally.** Direct mode has no `PostMessage` handler; §9 exists because of this.
2. **A queued transfer that fails after finalization is invisible to the contract.** `SETTLED` would then overstate reality. No safe automatic recovery exists.
3. **No challenger bonds.** Challenging is still free, so challenge spam is bounded only by the per-ground and per-case caps. Stage 1 approved a 0.5x challenger bond; it is not implemented here because the brief scoped V1 to proposer bonds only.
4. **An abandoned case refunds in full**, so walking away costs only gas and the lock time.
5. **`sink_address` is the deployer** and is not owner-mutable; there is no treasury governance.
6. **The bond is a flat amount**, so it is proportionally harsher on small participants and trivial for large ones.
7. **Slashing is not calibrated against real griefing costs** — the rates are reasoned, not measured.
8. **`time.time()` still raises linter warning W002** — a documented false positive.

---

## 12. What a later stage would add

Challenger bonds and the challenger reward from the Stage 1 economics; treasury governance for the sink; and, if live measurement justifies it, recalibrated rates. None of it is anticipated in code here.
