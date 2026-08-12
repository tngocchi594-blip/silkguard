from __future__ import annotations

import json
from pathlib import Path
from typing import Any


RULES_PATH = Path(__file__).parent / "data" / "rules_eu_appliances.json"


def load_rules() -> list[dict[str, Any]]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def _contains_any(values: list[str], terms: list[str]) -> bool:
    haystack = "\n".join(values).casefold()
    return any(term.casefold() in haystack for term in terms)


def evaluate_case(case: dict[str, Any]) -> list[dict[str, Any]]:
    # Defence in depth: database orchestration already gates rule execution,
    # but callers invoking the engine directly must not accidentally apply the
    # bundled EU pack to an advisory-only market.
    if case.get("coverage_tier") not in {None, "official_deterministic"}:
        return []

    documents = case.get("documents") or []
    labels = case.get("labels") or []
    claims = case.get("claims") or ""
    extracted_texts = case.get("extracted_texts") or []
    material_text = [*documents, *extracted_texts]
    label_text = [*labels, *extracted_texts]
    claims_text = "\n".join([claims, *extracted_texts])
    findings: list[dict[str, Any]] = []

    for rule in load_rules():
        triggered = False
        trigger_excerpt = ""
        if rule["control_type"] == "required_document":
            triggered = not _contains_any(material_text, rule["terms"])
            trigger_excerpt = "当前资料清单未找到：" + " / ".join(rule["terms"][:2])
        elif rule["control_type"] == "required_label":
            triggered = not _contains_any(label_text, rule["terms"])
            trigger_excerpt = "当前标签字段未找到：" + " / ".join(rule["terms"][:2])
        elif rule["control_type"] == "forbidden_claim":
            matched = [term for term in rule["terms"] if term.casefold() in claims_text.casefold()]
            triggered = bool(matched)
            trigger_excerpt = f'审查材料命中表述：“{matched[0]}”' if matched else ""

        if triggered:
            findings.append(
                {
                    **rule,
                    "trigger_excerpt": trigger_excerpt,
                    "status": "open",
                }
            )

    return findings


def readiness_score(findings: list[dict[str, Any]]) -> int:
    # Internal prioritisation index, not a certification score. The weights
    # keep a heavily incomplete case visibly recoverable while P0 findings
    # still force the state to "blocked".
    deductions = {"P0": 12, "P1": 5, "P2": 2}
    unresolved = [item for item in findings if item.get("status") != "resolved"]
    return max(0, 100 - sum(deductions.get(item.get("severity"), 4) for item in unresolved))


def readiness_state(findings: list[dict[str, Any]]) -> tuple[str, str]:
    unresolved = [item for item in findings if item.get("status") != "resolved"]
    if any(item.get("severity") == "P0" for item in unresolved):
        return "blocked", "存在阻断项"
    if unresolved:
        return "remediating", "整改后可复检"
    return "ready", "内部审查已通过"
