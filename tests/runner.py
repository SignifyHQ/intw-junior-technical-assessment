#!/usr/bin/env python3
"""
Minimal ledger runner. Maps command names to npm run ledger calls.
Build scenarios by composing the command functions in order.
"""

import re
import subprocess

REPO_ROOT = __file__.replace("/tests/runner.py", "")
accounts: dict[str, str] = {}  # name -> uuid


def _run(args: list[str]) -> str:
    cmd = ["npm", "run", "ledger", "--"] + args
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
    print(f"$ npm run ledger -- {' '.join(args)}")
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode != 0:
        print(f"[ERROR] exit {result.returncode}")
        print(result.stderr.strip())
        raise RuntimeError(f"ledger command failed: {' '.join(args)}")
    return result.stdout.strip()


def _run_expect_error(args: list[str]) -> str:
    """Run a command that is expected to fail; prints the error and returns stderr."""
    cmd = ["npm", "run", "ledger", "--"] + args
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT)
    print(f"$ npm run ledger -- {' '.join(args)}")
    if result.returncode == 0:
        raise AssertionError(f"Expected command to fail but it succeeded: {' '.join(args)}")
    print(f"[EXPECTED ERROR] {result.stderr.strip()}")
    return result.stderr.strip()


def _parse_entry_ids(output: str) -> dict[str, str]:
    """Extract debit and credit entry IDs from command output."""
    result = {}
    debit_match = re.search(r"Debit entry:\s+([0-9a-f-]{36})", output)
    credit_match = re.search(r"Credit entry:\s+([0-9a-f-]{36})", output)
    if debit_match:
        result["debit"] = debit_match.group(1)
    if credit_match:
        result["credit"] = credit_match.group(1)
    return result


def create_account(name: str) -> str:
    out = _run(["create-account", name])
    match = re.search(r"\(([0-9a-f-]{36})\)", out)
    if match:
        accounts[name] = match.group(1)
    return accounts[name]


def capture(account: str, amount: float) -> str:
    return _run(["capture", accounts.get(account, account), str(amount)])


def reverse(account: str, amount: float) -> str:
    return _run(["reverse", accounts.get(account, account), str(amount)])


def post(account: str, amount: float) -> dict[str, str]:
    out = _run(["post", accounts.get(account, account), str(amount)])
    return _parse_entry_ids(out)


def clear(account: str, amount: float) -> str:
    return _run(["clear", accounts.get(account, account), str(amount)])


def refund(account: str, amount: float, original_entry_id: str) -> str:
    return _run(["refund", accounts.get(account, account), str(amount), original_entry_id])


def status() -> str:
    return _run(["status"])


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

def scenario_A():
    create_account("merchant-acme")
    capture("merchant-acme", 100.50)
    status()
    post("merchant-acme", 100.50)
    status()
    clear("merchant-acme", 100.50)
    status()

def scenario_B():
    # Full lifecycle with a partial reverse before settlement.
    #
    # Expected balance at each step:
    #   after capture $100.70 → pending: $100.70 | posted: $0.00 | cash: -$100.70
    #   after reverse  $25.25 → pending:  $75.45 | posted: $0.00 | cash:  -$75.45
    #   after post     $75.45 → pending:   $0.00 | posted: $75.45 | cash:  -$75.45
    #   after clear    $75.45 → pending:   $0.00 | posted:  $0.00 | cash:    $0.00
    create_account("merchant-acme")

    capture("merchant-acme", 100.70)
    status()  # pending: $100.70

    reverse("merchant-acme", 25.25)   # partial void while still in pending
    status()  # pending: $75.45

    post("merchant-acme", 75.45)      # settle the remaining pending
    status()  # pending: $0.00 | posted: $75.45

    clear("merchant-acme", 75.45)     # disburse
    status()  # all books: $0.00


def scenario_C():
    # Full refund of a posted charge.
    #
    # Expected balance at each step:
    #   after capture $100.00 → pending: $100.00 | posted:   $0.00 | cash: -$100.00
    #   after post    $100.00 → pending:   $0.00 | posted: $100.00 | cash: -$100.00
    #   after refund  $100.00 → pending:   $0.00 | posted:   $0.00 | cash:    $0.00
    print("\n=== Scenario C: Full refund of a posted charge ===")
    create_account("merchant-full-refund")

    capture("merchant-full-refund", 100.00)
    status()  # pending: $100.00

    entries = post("merchant-full-refund", 100.00)
    status()  # posted: $100.00

    refund("merchant-full-refund", 100.00, entries["debit"])
    status()  # all books: $0.00


def scenario_D():
    # Partial refund of a posted charge — remainder stays in posted.
    #
    # Expected balance at each step:
    #   after capture  $100.00 → pending: $100.00 | posted:  $0.00 | cash: -$100.00
    #   after post     $100.00 → pending:   $0.00 | posted: $100.00 | cash: -$100.00
    #   after refund    $60.00 → pending:   $0.00 | posted:  $40.00 | cash:  -$40.00
    print("\n=== Scenario D: Partial refund of a posted charge ===")
    create_account("merchant-partial-refund")

    capture("merchant-partial-refund", 100.00)
    status()  # pending: $100.00

    entries = post("merchant-partial-refund", 100.00)
    status()  # posted: $100.00

    refund("merchant-partial-refund", 60.00, entries["debit"])
    status()  # posted: $40.00 | cash: -$40.00


def scenario_E():
    # Invalid refund attempts — both should error without mutating state.
    #
    #   attempt 1: refund $150 against $100 posted → insufficient balance
    #   attempt 2: refund with a made-up entry ID  → entry not found
    print("\n=== Scenario E: Invalid refund attempts ===")
    create_account("merchant-invalid-refund")

    capture("merchant-invalid-refund", 100.00)
    post("merchant-invalid-refund", 100.00)
    status()  # posted: $100.00

    _run_expect_error([
        "refund", accounts["merchant-invalid-refund"], "150",
        "00000000-0000-0000-0000-000000000000",
    ])  # entry check fires first (entry not in posted book), then would also fail balance

    _run_expect_error([
        "refund", accounts["merchant-invalid-refund"], "50",
        "00000000-0000-0000-0000-000000000000",
    ])  # valid amount, but entry ID doesn't exist

    status()  # posted: $100.00 — unchanged


def scenario_F():
    # Multiple partial refunds against the same original posted entry.
    # All three are valid; together they exhaust the full posted balance.
    #
    # Expected balance at each step:
    #   after capture  $120.00 → pending: $120.00 | posted:   $0.00 | cash: -$120.00
    #   after post     $120.00 → pending:   $0.00 | posted: $120.00 | cash: -$120.00
    #   after refund 1  $40.00 → pending:   $0.00 | posted:  $80.00 | cash:  -$80.00
    #   after refund 2  $40.00 → pending:   $0.00 | posted:  $40.00 | cash:  -$40.00
    #   after refund 3  $40.00 → pending:   $0.00 | posted:   $0.00 | cash:    $0.00
    print("\n=== Scenario F: Multiple partial refunds against the same posted entry ===")
    create_account("merchant-multi-refund")

    capture("merchant-multi-refund", 120.00)
    status()  # pending: $120.00

    entries = post("merchant-multi-refund", 120.00)
    status()  # posted: $120.00

    refund("merchant-multi-refund", 40.00, entries["debit"])
    status()  # posted: $80.00

    refund("merchant-multi-refund", 40.00, entries["debit"])
    status()  # posted: $40.00

    refund("merchant-multi-refund", 40.00, entries["debit"])
    status()  # all books: $0.00


if __name__ == "__main__":
    # scenario_A()
    # scenario_B()
    scenario_C()
    scenario_D()
    scenario_E()
    scenario_F()
