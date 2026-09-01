# Stage 2 — GenLayer Runtime Compatibility Note

Every runtime decision below is classified as:

- **CURRENT_OFFICIAL_DOCS** — established by current docs.genlayer.com or skills.genlayer.com
- **LIVE_PROVEN_EXISTING_ENVIRONMENT** — proven in a user-owned contract that ran in a real environment
- **BOTH**
- **UNKNOWN** — not established; not designed around

Sources consulted (2026-09-01): `docs.genlayer.com` (first intelligent contract, storage, non-determinism, transaction context, fetch web content), and `skills.genlayer.com` → `genlayerlabs/skills` plugin `genlayer-dev`, skills `write-contract`, `genvm-lint`, `direct-tests`.

Local tooling actually installed and exercised: `genvm-linter 0.10.0`, `genlayer-test 0.29.2`, `genlayer-py 0.16.3`, Python 3.12.10.

---

## 1. Runtime dependency pin

**Selected:**

```
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

**Classification: BOTH.** This exact hash is the one shown in the current official "Your First Intelligent Contract" example and in the official `genlayer-dev/write-contract` skill, and it is the hash in the user's existing StudioNet-deployed `continuum` contract. `genvm-lint validate` resolved the SDK from it successfully.

`py-genlayer:test`, `py-genlayer:latest`, and unversioned aliases are **rejected by all GenLayer networks** (CURRENT_OFFICIAL_DOCS — `write-contract` skill) and are guarded against by a source-shape test.

**Open item, deliberately not acted on:** `genvm-lint` reports that a newer runner exists:

```
py-genlayer: a newer runner is available
(9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0)
```

The newer hash is **not** in current documentation or the official skill. Switching the production pin to a runner that documentation does not yet describe would trade a doubly-corroborated pin for an unverified one. Recommendation: stay on `1jb45aa...` for now; revisit at the Stage 4 live gate, where the runtime is exercised for real. **This is a decision for the user, recorded rather than taken silently.**

---

## 2. Caller identity

**Selected: `gl.message.sender_address`.**

**Classification: BOTH.** Current official documentation for transaction context lists the typed `gl.message` fields exactly as:

- `sender_address` (`Address`) — "Immediate caller — EOA, EVM contract, or IC depending on how the call was initiated"
- `origin_address` (`Address`) — "Original transaction submitter — preserved through internal message chains"
- `contract_address` (`Address`)
- `value` (`u256`) — "GEN sent with the call (only in `@gl.public.write.payable` methods)"
- `chain_id` (`u256`)

`sender_address` is also what the user's existing deployed contracts use.

**`origin_address` is deliberately NOT used.** Authorizing on the original submitter rather than the immediate caller breaks contract-to-contract composability and is the classic `tx.origin` authorization antipattern. A source-shape test fails the build if `origin_address` appears.

### Documented conflict: `sender_account`

The official `genlayer-dev/write-contract` skill is **internally inconsistent**. Its contract skeleton uses `gl.message.sender_account`:

```python
if gl.message.sender_account != self.owner:
    raise gl.UserError("Only owner")
```

while its storage-declaration example, a few sections later, uses `sender_address`:

```python
self.owner = gl.message.sender_address   # <- initial value only
```

Current official documentation lists only `sender_address`. **Resolution: use `sender_address`**, which is documented, live-proven, and passed local SDK validation. A source-shape test fails if `sender_account` appears. The conflict is recorded here rather than silently resolved.

---

## 3. Storage types

**Classification: BOTH** for `TreeMap[K, V]`, `DynArray[T]`, `Address`, sized integers (`u256`), and `str`/`bool`.

Documented rules applied:

- `DynArray[T]` instead of `list[T]`; `TreeMap[K, V]` instead of `dict[K, V]`
- sized integers (`u256`) instead of bare `int`
- all generic types fully specified
- storage fields are **class-level annotations**, never assignments in `__init__`
- `DynArray`/`TreeMap` need no initialization; they start empty
- `bigint` only for arbitrary precision — **not used**; all quantities fit `u256`
- Python `Enum` is not supported in storage: "Store `.value`, not the enum itself"

**Custom storage dataclasses:** `@allow_storage` + `@dataclass`.

**Classification: CURRENT_OFFICIAL_DOCS**, now additionally confirmed locally by successful `genvm-lint validate` and schema extraction. Note that `dataclass` is **not** exported by `from genlayer import *`; it needs an explicit `from dataclasses import dataclass`. Without it, validation fails with `Failed to load contract: name 'dataclass' is not defined`. This was found by running the tool, not by reading docs.

Nested `DynArray[DimensionFinding]` inside a storage dataclass validated successfully.

---

## 4. Contract class name — tooling gotcha

**Classification: LIVE_PROVEN_EXISTING_ENVIRONMENT (local tooling).**

The official docs example declares `class Contract(gl.Contract)`. That exact name **breaks local schema extraction**: `genvm_linter/validate/sdk_loader.py::find_contract_class` skips any class whose name is literally `Contract`:

```python
for name, obj in vars(module).items():
    if not isinstance(obj, type) or name == "Contract":
        continue
```

A minimal, doc-shaped contract named `Contract` fails with `E105: No contract class found`; renaming it makes validation pass. Our class is therefore named **`DefiRulebook`**, and a source-shape test enforces that.

This is a linter limitation, not necessarily a Studio limitation — but since a distinct class name is valid either way and unblocks local schema verification, it costs nothing to adopt.

---

## 5. Deterministic time

**Selected: `u256(int(time.time()))`.**

**Classification: CURRENT_OFFICIAL_DOCS.** Time in GenVM is "deterministic and pinned to the transaction's timestamp" — every validator sees the same value. Documented approaches are `int(time.time())` / `int(datetime.now(timezone.utc).timestamp())` for Unix seconds, a `datetime` object for comparisons, and an ISO string (or `gl.message_raw['datetime']`) for audit storage. Unix seconds in `u256` is the single persisted representation, chosen for cheap arithmetic on windows and deadlines.

**Known false positive:** `genvm-lint lint` emits

```
W002 line 236: Non-deterministic call 'time.time()'
```

This is a static AST heuristic (`FORBIDDEN_CALLS` in `genvm_linter/lint/safety.py`) that flags `time.time` and `datetime.now` generically, because it cannot know the code runs inside GenVM where the clock is pinned. Documentation explicitly sanctions this call. **Warning accepted and documented; lint still reports `ok: true`.** Caveat carried forward from the docs: the clock is transaction time, so it is valid for relative calculations and timestamping, not for real-world time assertions.

---

## 6. Payable methods and native value

**Classification: BOTH**, but **not implemented in Stage 2.**

- `@gl.public.write.payable` receives value (CURRENT_OFFICIAL_DOCS)
- `gl.message.value` (`u256`) reads it (CURRENT_OFFICIAL_DOCS + live in `continuum`)
- outbound transfer via an `@gl.evm.contract_interface` shim calling `.emit_transfer(value=u256(n))` (LIVE_PROVEN_EXISTING_ENVIRONMENT)

**Outbound transfer failure semantics: UNKNOWN.** The `write-contract` skill documents `emit()` as asynchronous — "queues the call — it executes after current transaction", with `on="accepted"` or `on="finalized"` — and warns that "if the current transaction is appealed after `emit()`, the emitted call still happens but the balance may already be decremented." Prior local evidence instead suggests a synchronous failure can revert the whole transaction. These imply different failure models. The Stage 1 addendum (§41.4) already removed `PAYOUT_FAILED` and adopted a rollback-compatible state machine that is safe under the synchronous model; the async residual is a Stage 4 live verification item. Nothing here is designed around a guess.

---

## 7. Non-determinism and web access

**Classification: CURRENT_OFFICIAL_DOCS.** All `gl.nondet.*` calls must run inside the callable passed to an equivalence principle; storage writes, `gl.get_contract_at()`, `.emit()` and nested nondet blocks are forbidden inside it.

**Not used in Stage 2 at all.** No `gl.nondet.web.*`, no `gl.nondet.exec_prompt`, no `gl.eq_principle.*`, no `gl.vm.run_nondet_unsafe`. Source-shape tests fail the build if any appears. These arrive in Stages 5-7, after the Stage 4 convergence gate.

---

## 8. Error raising

Stage 2 raises a plain `Exception` prefixed with `[EXPECTED]`, following the skill's error-classification convention (`[EXPECTED]` / `[EXTERNAL]` / `[TRANSIENT]` / `[LLM_ERROR]`) so validators can agree on failure paths.

**`gl.UserError` vs `gl.vm.UserError`: UNKNOWN.** The official skill uses both spellings in different sections. Rather than guess a symbol that may not resolve, Stage 2 uses a plain prefixed `Exception`, which validated and typechecked cleanly. Resolve against the runtime before Stage 3 hardens error handling.

---

## 9. Test harness

`genlayer-test 0.29.2` provides direct mode (`direct_vm`, `direct_deploy`, `direct_alice`, ...) with no server, no Docker and no network.

**Windows bug found (harness only, not the contract):** `gltest/direct/loader.py::_inject_message_to_fd0` writes the encoded message to a temp file, `os.dup2`s it onto fd 0, then `os.unlink`s it in a `finally`. Windows refuses to unlink a file that is still open, so every direct deploy failed with `PermissionError: [WinError 32]` before the contract loaded. `tests/direct/conftest.py` tolerates that one specific error; the fd injection has already succeeded by then. Cost: one leaked temp file per deploy. The same contract loads cleanly under `genvm-lint check`, confirming the fault is in the harness.

---

## 10. Summary of UNKNOWNs carried into later stages

| Item | Stage to resolve |
|---|---|
| Outbound native transfer: synchronous-revert vs async-queued | Stage 4 |
| `gl.UserError` vs `gl.vm.UserError` exact symbol | Stage 3 |
| Whether to move the runner pin to `9b8kjyda...` | Stage 4 (user decision) |
| `strict_eq` convergence on real pages | Stage 4 gate |
| Whether Studio's schema loader agrees with `genvm-lint schema` | Manual check by the user |
