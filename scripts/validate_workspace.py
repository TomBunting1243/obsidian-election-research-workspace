#!/usr/bin/env python3
"""Validate the starter vault's race notes and normalized dashboard sidecars."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / "demo-vault"
DATA_ROOT = VAULT / "Resources" / "Data" / "Elections" / "races"
NOTES_ROOT = VAULT / "Elections"
REQUIRED_KEYS = {
    "schema_version", "race_id", "retrieved_at", "status", "source",
    "source_url", "overview", "election_date", "candidates", "ratings",
    "models", "model_trend", "polling", "campaign_finance", "history",
    "election_calendar",
}
RACE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]+$")


def validate_dashboard(path: Path) -> list[str]:
    errors: list[str] = []
    data = json.loads(path.read_text())
    missing = sorted(REQUIRED_KEYS - data.keys())
    if missing:
        errors.append(f"{path}: missing {', '.join(missing)}")
    if data.get("race_id") != path.parent.name:
        errors.append(f"{path}: race_id does not match its directory")
    if not RACE_ID_PATTERN.fullmatch(str(data.get("race_id", ""))):
        errors.append(f"{path}: race_id is not URL- and path-safe")
    for section in ("polling", "campaign_finance", "history", "election_calendar"):
        value = data.get(section)
        if not isinstance(value, dict) or not value.get("status"):
            errors.append(f"{path}: {section} requires an explicit status")
    candidates = data.get("candidates", [])
    if len(candidates) < 2:
        errors.append(f"{path}: expected at least two candidates")
    for candidate in candidates:
        if not candidate.get("name") or not candidate.get("party"):
            errors.append(f"{path}: candidate requires name and party")
    return errors


def validate_notes(race_ids: set[str]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for path in NOTES_ROOT.glob("*.md"):
        text = path.read_text()
        match = re.search(r"^Race ID:\s*([^\n]+)$", text, re.MULTILINE)
        if not match:
            continue
        race_id = match.group(1).strip().strip('"')
        seen.add(race_id)
        if f'raceId: "{race_id}"' not in text:
            errors.append(f"{path}: embed does not match Race ID")
    for race_id in sorted(race_ids - seen):
        errors.append(f"missing race note for {race_id}")
    return errors


def main() -> int:
    dashboards = sorted(DATA_ROOT.glob("*/dashboard.json"))
    errors: list[str] = []
    for dashboard in dashboards:
        errors.extend(validate_dashboard(dashboard))
    errors.extend(validate_notes({path.parent.name for path in dashboards}))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(dashboards)} synthetic race dashboards and their notes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
