"""Source-shape guards for the canonical production contract.

These are static checks over the contract text. They exist because the failure
they defend against - "could not load contract schema" - happens at deploy time,
long after a normal unit test would have caught anything.
"""

import ast
import hashlib
import json
import pathlib
import re

REPO = pathlib.Path(__file__).resolve().parents[1]
CONTRACT = REPO / "contracts" / "defi_rulebook.py"

RAW = CONTRACT.read_bytes()
TEXT = RAW.decode("utf-8")

EXPECTED_RUNNER = "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6"


def test_contract_file_exists():
    assert CONTRACT.is_file()


def test_source_is_pure_ascii():
    try:
        RAW.decode("ascii")
    except UnicodeDecodeError as exc:  # pragma: no cover - failure path
        offset = exc.start
        line = TEXT[:offset].count("\n") + 1
        raise AssertionError(
            f"non-ASCII byte at line {line}, offset {offset}: {RAW[offset:offset + 4]!r}"
        )


def test_no_smart_quotes_or_decorative_unicode():
    for bad in ["‘", "’", "“", "”", "–", "—",
                "→", "←", "✓", " "]:
        assert bad not in TEXT, f"decorative/unicode char {bad!r} in contract source"


def test_first_line_is_the_pinned_runner_header():
    first = TEXT.splitlines()[0]
    assert first.startswith("# {"), "first line must be the Depends magic comment"
    payload = json.loads(first.lstrip("#").strip())
    assert payload["Depends"] == EXPECTED_RUNNER


def test_runner_pin_is_not_floating():
    for alias in ["py-genlayer:test", "py-genlayer:latest"]:
        assert alias not in TEXT, f"floating runner alias {alias} present"
    assert re.search(r'"Depends":\s*"py-genlayer:[a-z0-9]{40,}"', TEXT), (
        "Depends must pin a concrete runner hash"
    )


def test_no_prose_block_before_the_header():
    """A long leading comment block is a known schema-load failure mode."""
    lines = TEXT.splitlines()
    assert lines[0].startswith("# {")
    # Nothing but the header may precede the import of the SDK.
    idx = next(i for i, l in enumerate(lines) if l.startswith("from genlayer"))
    assert idx <= 3, "SDK import must appear immediately after the header"


def test_exactly_one_contract_class():
    tree = ast.parse(TEXT)
    contract_classes = [
        node.name
        for node in tree.body
        if isinstance(node, ast.ClassDef)
        and any(
            isinstance(b, ast.Attribute) and b.attr == "Contract"
            for b in node.bases
        )
    ]
    assert contract_classes == ["DefiRulebook"], contract_classes


def test_contract_class_is_not_named_contract():
    """genvm-lint's schema extractor skips a class literally named `Contract`."""
    assert "class Contract(gl.Contract)" not in TEXT


def _imported_modules():
    tree = ast.parse(TEXT)
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                imported.add(a.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    return imported


def test_no_backend_or_scraping_imports():
    forbidden = [
        "requests", "httpx", "socket", "bs4", "beautifulsoup",
        "selenium", "playwright", "scrapy", "supabase", "firebase",
        "psycopg", "sqlalchemy", "pymongo", "redis", "boto3",
        "os", "sys", "subprocess", "random", "pathlib", "shutil",
        "io", "http", "asyncio", "threading", "tempfile", "pickle",
    ]
    roots = {m.split(".")[0] for m in _imported_modules()}
    for name in forbidden:
        assert name not in roots, f"forbidden import: {name}"


def test_import_allowlist():
    """Only modules the GenVM linter permits, plus the SDK itself."""
    allowed = {"genlayer", "dataclasses", "hashlib", "time", "urllib.parse"}
    assert _imported_modules() <= allowed, _imported_modules() - allowed


def test_urllib_is_only_the_parse_submodule():
    """`urllib.parse` is explicitly allowlisted; the network submodules are not."""
    for banned in ["urllib.request", "urllib.error", "urllib.robotparser"]:
        assert banned not in TEXT


def test_no_web_or_adjudication_calls_in_stage_2():
    for call in ["gl.nondet.web", "gl.eq_principle", "gl.nondet.exec_prompt",
                 "gl.vm.run_nondet", "exec_prompt("]:
        assert call not in TEXT, f"Stage 2 must not contain {call}"


def test_no_payout_execution_yet():
    for call in ["emit_transfer", "gl.evm.contract_interface", ".emit(",
                 "gl.deploy_contract", "gl.get_contract_at",
                 "gl.message.value", "payable"]:
        assert call not in TEXT, f"payout logic must not appear yet: {call}"


def test_no_canonical_version_write_shortcut():
    """Only adjudication may mint a canonical version, in a later stage.

    Nothing public may set a rule's version, fingerprint or text directly.
    """
    banned = [
        "set_rule_version", "admin_set_rule", "force_establish", "accept_claim",
        "establish_rule", "set_current_version", "set_verdict", "override_verdict",
        "force_verdict", "mint_version", "seed_rule",
    ]
    for name in banned:
        assert name not in TEXT, f"canonical-write shortcut present: {name}"


def test_rule_version_record_is_never_written():
    """RuleVersionRecord storage exists but must not be constructed yet."""
    assert "RuleVersionRecord(" not in TEXT.replace("class RuleVersionRecord", "")


def test_stale_binding_check_exists():
    """The concurrency anchor must actually be enforced, not just stored."""
    assert "_binding_is_current" in TEXT
    assert "expected_fingerprint" in TEXT


def test_uses_stable_error_codes():
    for code in ["[PAUSED]", "[STALE_CASE]", "[DUPLICATE_EVIDENCE]",
                 "[INVALID_URL]", "[ACTIVE_CASE_EXISTS]", "[MIN_EVIDENCE]"]:
        assert code in TEXT, f"missing stable error code {code}"


def test_uses_runtime_supported_user_error():
    """gl.vm.UserError exists in the pinned SDK; gl.UserError does not."""
    assert "gl.vm.UserError" in TEXT
    assert "gl.UserError" not in TEXT


def test_no_hardcoded_foreign_addresses():
    """No deployed addresses from unrelated projects may appear in the source."""
    hits = re.findall(r"0x[0-9a-fA-F]{40}", TEXT)
    assert hits == [], f"hardcoded contract addresses present: {hits}"


def test_no_placeholder_todo_business_logic():
    for marker in ["TODO", "FIXME", "XXX", "HACK", "NotImplementedError", "pass  #"]:
        assert marker not in TEXT, f"placeholder marker {marker} in production source"


def test_no_treasury_trial_contamination():
    """Stage 2 vocabulary must be rulebook semantics, not DAO treasury semantics."""
    foreign = [
        "treasury", "allocation", "amendment", "dao_", "proposal_amount",
        "disbursement", "budget", "grant", "foresign", "reality_lock",
        "continuum", "contradiction",
    ]
    lowered = TEXT.lower()
    for term in foreign:
        assert term not in lowered, f"foreign project term in contract: {term}"


def test_amendment_case_type_is_absent():
    assert "AMENDMENT" not in TEXT.upper().replace("AMENDMENTS", "")


def test_core_case_types_present():
    assert '"RULE_CLAIM"' in TEXT
    assert '"RULE_DRIFT"' in TEXT


def test_no_float_literals_in_money_paths():
    tree = ast.parse(TEXT)
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, float):
            raise AssertionError(f"float literal at line {node.lineno}")


def test_uses_documented_caller_api():
    assert "gl.message.sender_address" in TEXT
    # sender_account is not documented for the pinned runtime.
    assert "sender_account" not in TEXT
    # origin_address must not be used as an authorization shortcut.
    assert "origin_address" not in TEXT


def test_contract_digest_is_reported():
    """Not an assertion about the value - it prints the hash used in the report."""
    digest = hashlib.sha256(RAW).hexdigest()
    assert len(digest) == 64
    print("contract sha256:", digest)
