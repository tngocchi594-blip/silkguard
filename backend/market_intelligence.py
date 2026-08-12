from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DATA_FILE = Path(__file__).resolve().parent / "data" / "market_profiles.json"

EU_MEMBER_IDS = {
    "austria", "belgium", "bulgaria", "croatia", "cyprus", "czech-republic",
    "denmark", "estonia", "finland", "france", "germany", "greece", "hungary",
    "ireland", "italy", "latvia", "lithuania", "luxembourg", "malta",
    "netherlands", "poland", "portugal", "romania", "slovakia", "slovenia",
    "spain", "sweden",
}


@lru_cache(maxsize=1)
def _payload() -> dict[str, Any]:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def list_markets(query: str = "", risk_level: str = "") -> list[dict[str, Any]]:
    query_value = query.strip().lower()
    results: list[dict[str, Any]] = []
    for raw in _payload()["markets"]:
        item = dict(raw)
        if item["id"] in EU_MEMBER_IDS or item["id"] == "eu":
            item["coverage_tier"] = "official_deterministic"
            item["official_rule_pack"] = "EU smart appliances"
            item["official_rule_count"] = 8
        else:
            item["coverage_tier"] = "advisory_only"
            item["official_rule_pack"] = None
            item["official_rule_count"] = 0
        haystack = " ".join(
            [
                item["id"],
                item["name_zh"],
                item["name_en"],
                item["cultural_note"],
                item["key_risk"],
                " ".join(item["certifications"]),
            ]
        ).lower()
        if query_value and query_value not in haystack:
            continue
        if risk_level and item["risk_level"] != risk_level:
            continue
        results.append(item)
    return results


def get_market(market_id: str) -> dict[str, Any] | None:
    normalized = market_id.strip().lower()
    return next((item for item in list_markets() if item["id"] == normalized), None)


def resolve_market(market_value: str) -> dict[str, Any] | None:
    """Resolve an id or human-facing market label without guessing a jurisdiction.

    Existing clients store labels such as ``欧盟 · 德国`` in ``cases.market`` while
    newer clients can store a stable market id in ``details.market_id``.  Exact ids
    and names win; composite labels are only matched against known catalogue names.
    Unknown labels deliberately fail closed.
    """

    value = (market_value or "").strip()
    normalized = value.casefold()
    if not normalized:
        return None

    markets = list_markets()
    for item in markets:
        if normalized in {
            item["id"].casefold(),
            item["name_zh"].casefold(),
            item["name_en"].casefold(),
        }:
            return item

    # A composite label that explicitly names the EU should resolve to the EU
    # pack before a member state.  This preserves legacy "欧盟 · 德国" cases.
    if "欧盟" in value or "european union" in normalized:
        return get_market("eu")

    for item in sorted(markets, key=lambda market: len(market["name_zh"]), reverse=True):
        if item["name_zh"] and item["name_zh"] in value:
            return item
        english_name = item["name_en"].casefold()
        if len(english_name) >= 4 and english_name in normalized:
            return item
    return None


def case_market_coverage(case: dict[str, Any]) -> dict[str, Any]:
    details = case.get("details") or {}
    requested = str(details.get("market_id") or case.get("market") or "")
    market = resolve_market(requested)
    if not market:
        return {
            "market_id": None,
            "market_name": requested or "未识别市场",
            "tier": "advisory_only",
            "rule_pack": None,
            "official_rule_count": 0,
            "can_issue_compliance_decision": False,
            "resolution_status": "unrecognized_market",
            "warning": "目标市场无法映射到已审核规则包；仅可保存资料与提供咨询线索。",
        }

    official = market["coverage_tier"] == "official_deterministic"
    return {
        "market_id": market["id"],
        "market_name": market["name_zh"],
        "tier": market["coverage_tier"],
        "rule_pack": market["official_rule_pack"],
        "official_rule_count": market["official_rule_count"],
        "can_issue_compliance_decision": official,
        "resolution_status": "resolved",
        "warning": (
            "已绑定审核过的官方规则包，可输出内部预审结论。"
            if official
            else "当前仅有咨询级市场画像；不得执行欧盟规则或输出合规放行结论。"
        ),
    }


def market_summary() -> dict[str, Any]:
    markets = list_markets()
    return {
        "total": len(markets),
        "official_deterministic": sum(
            item["coverage_tier"] == "official_deterministic" for item in markets
        ),
        "advisory_only": sum(item["coverage_tier"] == "advisory_only" for item in markets),
        "source": _payload()["source"],
    }
