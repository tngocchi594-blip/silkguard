from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from .database import get_case
from .integrations import generate_ai_summary
from .market_intelligence import get_market


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _tool(
    name: str,
    label: str,
    status: str,
    output: str,
    evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": "tool-" + uuid.uuid4().hex[:8],
        "name": name,
        "label": label,
        "status": status,
        "output": output,
        "evidence": evidence or [],
    }


async def run_agent_mission(payload: dict[str, Any]) -> dict[str, Any]:
    market = get_market(payload["market_id"])
    if not market:
        raise ValueError("market_not_found")

    case = get_case(payload.get("case_id") or "case-eu-hairdryer-001")
    official = market["coverage_tier"] == "official_deterministic"
    case_official = bool(
        case and case.get("coverage", {}).get("tier") == "official_deterministic"
    )
    deterministic_allowed = official and case_official
    certifications = "、".join(market["certifications"][:6]) or "待核验"
    tool_calls = [
        _tool(
            "market_profile_lookup",
            "市场画像检索",
            "complete",
            f"已载入 {market['name_zh']} 市场画像；风险分 {market['advisory_score']}/100。",
        ),
        _tool(
            "certification_mapper",
            "认证路径映射",
            "complete",
            f"候选准入/认证线索：{certifications}。需在官方来源层确认适用性。",
        ),
        _tool(
            "cultural_risk_scan",
            "文化与商业风险扫描",
            "complete",
            market["key_risk"] or market["cultural_note"] or "未发现结构化风险提示。",
        ),
    ]

    evidence: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    if deterministic_allowed and case:
        findings = case.get("findings", [])
        evidence = [
            {
                "title": item["source_name"],
                "authority": item["source_authority"],
                "url": item["source_url"],
                "effective_date": item["effective_date"],
            }
            for item in findings[:6]
        ]
        tool_calls.append(
            _tool(
                "deterministic_rule_engine",
                "确定性规则执行",
                "complete",
                f"执行 8 项欧盟核心控制，识别 {len(findings)} 个问题。",
                evidence,
            )
        )
    else:
        mismatch = official and case and not case_official
        tool_calls.append(
            _tool(
                "official_rule_engine",
                "官方规则判定",
                "needs_evidence",
                (
                    "任务目标有官方规则包，但所选案件不是官方确定性覆盖市场；"
                    "系统拒绝跨市场复用欧盟结论。"
                    if mismatch
                    else "该市场当前只有咨询级画像，系统拒绝生成‘已合规’结论。"
                ),
            )
        )

    synthesis = {
        "provider": "deterministic",
        "summary": (
            f"{payload['product_name']} 面向 {market['name_zh']} 的任务已完成市场画像、认证路径和风险扫描。"
        ),
        "next_actions": [
            f"核验 {certifications} 对当前品类与型号的适用性",
            "上传产品规格、标签、说明书与测试报告",
            "由合规负责人复核高风险结论并决定是否放行",
        ],
        "disclaimer": "内部预审结果，不替代律师、认证机构或主管机关意见。",
    }
    if deterministic_allowed and case:
        synthesis = await generate_ai_summary(case)

    tool_calls.extend(
        [
            _tool(
                "deepseek_synthesis",
                "DeepSeek 整改编排",
                "complete",
                synthesis.get("summary", "已生成结构化整改摘要。"),
            ),
            _tool(
                "human_release_gate",
                "人工放行门",
                "waiting",
                "高风险证据须由责任人核验；智能体无权自行放行。",
            ),
        ]
    )
    return {
        "id": "run-" + uuid.uuid4().hex[:12],
        "created_at": _now(),
        "status": "awaiting_human_review" if deterministic_allowed else "needs_official_evidence",
        "mission": payload,
        "market": market,
        "coverage": {
            "tier": market["coverage_tier"],
            "label": "官方规则判定" if deterministic_allowed else "市场情报预研",
            "can_issue_compliance_decision": deterministic_allowed,
            "warning": (
                "已绑定官方规则与来源，可输出内部准入判断。"
                if deterministic_allowed
                else "仅提供市场情报与认证线索；补齐官方规则源前不得输出合规放行结论。"
            ),
        },
        "plan": [
            "识别商品与目标市场",
            "载入市场画像与认证线索",
            "执行适用的确定性规则",
            "生成整改动作与证据包",
            "进入人工放行门",
        ],
        "tool_calls": tool_calls,
        "evidence": evidence,
        "synthesis": synthesis,
        "findings": findings[:8],
    }
