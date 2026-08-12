from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .market_intelligence import case_market_coverage
from .rules_engine import evaluate_case, load_rules, readiness_score, readiness_state


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _configured_path(name: str, fallback: Path) -> Path:
    configured = os.getenv(name, "").strip()
    return Path(configured) if configured else fallback


DATA_DIR = _configured_path("SILKGUARD_DATA_DIR", PROJECT_ROOT / "var")
DB_PATH = _configured_path("SILKGUARD_DB_PATH", DATA_DIR / "silkguard-v2.db")
UPLOAD_DIR = DATA_DIR / "uploads"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS cases (
                id TEXT PRIMARY KEY,
                sku TEXT NOT NULL,
                brand TEXT NOT NULL,
                product_name TEXT NOT NULL,
                market TEXT NOT NULL,
                platform TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL,
                status_label TEXT NOT NULL,
                readiness INTEGER NOT NULL DEFAULT 100,
                current_stage TEXT NOT NULL,
                claims TEXT NOT NULL DEFAULT '',
                documents_json TEXT NOT NULL DEFAULT '[]',
                labels_json TEXT NOT NULL DEFAULT '[]',
                details_json TEXT NOT NULL DEFAULT '{}',
                coverage_tier TEXT NOT NULL DEFAULT 'unknown',
                rule_pack TEXT NOT NULL DEFAULT '',
                operation_state TEXT NOT NULL DEFAULT 'idle',
                last_operation TEXT NOT NULL DEFAULT '',
                retryable INTEGER NOT NULL DEFAULT 0,
                last_error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS findings (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                rule_id TEXT NOT NULL,
                severity TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                status TEXT NOT NULL,
                trigger_excerpt TEXT NOT NULL,
                evidence_quote TEXT NOT NULL,
                source_name TEXT NOT NULL,
                source_url TEXT NOT NULL,
                source_authority TEXT NOT NULL,
                effective_date TEXT NOT NULL,
                action TEXT NOT NULL,
                needs_human_review INTEGER NOT NULL DEFAULT 0,
                reviewer_note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id TEXT NOT NULL,
                stage TEXT NOT NULL,
                label TEXT NOT NULL,
                status TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                case_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content_type TEXT NOT NULL,
                parser TEXT NOT NULL,
                extracted_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY(case_id) REFERENCES cases(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS source_snapshots (
                id TEXT PRIMARY KEY,
                source_name TEXT NOT NULL,
                authority TEXT NOT NULL,
                jurisdiction TEXT NOT NULL,
                source_url TEXT NOT NULL,
                effective_date TEXT NOT NULL,
                retrieved_at TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                status TEXT NOT NULL
            );
            """
        )
        _ensure_case_columns(conn)
        count = conn.execute("SELECT COUNT(*) AS value FROM cases").fetchone()["value"]
        if not count:
            _seed(conn)
        else:
            # Competition-safe demo provenance: do not imply authorization from a real brand.
            conn.execute(
                "UPDATE cases SET brand = 'AERIS' WHERE id = ? AND brand = 'SUHOME LAB'",
                ("case-eu-hairdryer-001",),
            )
        _backfill_case_coverage(conn)


def _ensure_case_columns(conn: sqlite3.Connection) -> None:
    """Apply additive migrations so existing competition databases keep working."""

    existing = {row["name"] for row in conn.execute("PRAGMA table_info(cases)").fetchall()}
    additions = {
        "coverage_tier": "TEXT NOT NULL DEFAULT 'unknown'",
        "rule_pack": "TEXT NOT NULL DEFAULT ''",
        "operation_state": "TEXT NOT NULL DEFAULT 'idle'",
        "last_operation": "TEXT NOT NULL DEFAULT ''",
        "retryable": "INTEGER NOT NULL DEFAULT 0",
        "last_error": "TEXT NOT NULL DEFAULT ''",
    }
    for name, definition in additions.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE cases ADD COLUMN {name} {definition}")


def _backfill_case_coverage(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT id, market, details_json, coverage_tier FROM cases").fetchall()
    for row in rows:
        case = {
            "market": row["market"],
            "details": json.loads(row["details_json"] or "{}"),
        }
        coverage = case_market_coverage(case)
        previous = row["coverage_tier"]
        conn.execute(
            "UPDATE cases SET coverage_tier = ?, rule_pack = ? WHERE id = ?",
            (coverage["tier"], coverage["rule_pack"] or "", row["id"]),
        )
        if coverage["tier"] != "official_deterministic":
            stale_count = conn.execute(
                "SELECT COUNT(*) AS value FROM findings WHERE case_id = ?", (row["id"],)
            ).fetchone()["value"]
            if stale_count:
                conn.execute("DELETE FROM findings WHERE case_id = ?", (row["id"],))
                _add_event(
                    conn,
                    row["id"],
                    "scope",
                    "已隔离不适用规则结论",
                    "needs_evidence",
                    "目标市场没有已审核规则包，已移除历史欧盟规则结果。",
                )
        if previous == "unknown":
            conn.execute(
                "UPDATE cases SET updated_at = ? WHERE id = ?",
                (now_iso(), row["id"]),
            )


def _seed(conn: sqlite3.Connection) -> None:
    timestamp = now_iso()
    sample_case = {
        "id": "case-eu-hairdryer-001",
        "sku": "SG-ELEC-001",
        "brand": "AERIS",
        "product_name": "高速负离子吹风机",
        "market": "欧盟 · 德国",
        "platform": "Amazon EU",
        "category": "智能小家电 / 个护电器",
        "status": "blocked",
        "status_label": "存在阻断项",
        "readiness": 34,
        "current_stage": "整改中",
        "claims": "Professional salon-grade negative ion technology repairs damaged hair instantly and guarantees safe use for all hair types.",
        "documents": ["产品铭牌照片", "英文说明书草稿", "产品图片集"],
        "labels": ["产品型号", "额定电压 220-240V", "额定功率 1600W", "制造商信息", "CE 标志"],
        "details": {
            "hs_code": "8516310000",
            "voltage": "220-240V",
            "power": "1600W",
            "owner": "合规负责人",
            "monthly_sku": 50,
        },
    }
    conn.execute(
        """
        INSERT INTO cases (
            id, sku, brand, product_name, market, platform, category,
            status, status_label, readiness, current_stage, claims,
            documents_json, labels_json, details_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            sample_case["id"],
            sample_case["sku"],
            sample_case["brand"],
            sample_case["product_name"],
            sample_case["market"],
            sample_case["platform"],
            sample_case["category"],
            sample_case["status"],
            sample_case["status_label"],
            sample_case["readiness"],
            sample_case["current_stage"],
            sample_case["claims"],
            json.dumps(sample_case["documents"], ensure_ascii=False),
            json.dumps(sample_case["labels"], ensure_ascii=False),
            json.dumps(sample_case["details"], ensure_ascii=False),
            timestamp,
            timestamp,
        ),
    )
    for stage, label, status, detail in [
        ("ingest", "资料接收与字段解析", "complete", "已识别 3 份资料与 5 个标签字段"),
        ("scope", "市场与规则包定位", "complete", "欧盟 · 智能小家电 · Amazon EU"),
        ("evidence", "官方证据检索", "complete", "已绑定 EUR-Lex 与 Amazon 官方来源"),
        ("audit", "确定性规则审查", "complete", "完成 8 项核心控制检查"),
        ("review", "高风险人工复核", "attention", "4 个 P0 项待复核"),
        ("remediation", "整改任务执行", "active", "等待补件和 Listing 修改"),
        ("recheck", "增量复检与放行", "pending", "整改完成后自动进入"),
    ]:
        _add_event(conn, sample_case["id"], stage, label, status, detail)
    _replace_findings(conn, sample_case)
    _seed_sources(conn)


def _seed_sources(conn: sqlite3.Connection) -> None:
    seen: set[str] = set()
    for rule in load_rules():
        if rule["source_url"] in seen:
            continue
        seen.add(rule["source_url"])
        source_id = "src-" + uuid.uuid5(uuid.NAMESPACE_URL, rule["source_url"]).hex[:12]
        conn.execute(
            """
            INSERT OR IGNORE INTO source_snapshots (
                id, source_name, authority, jurisdiction, source_url,
                effective_date, retrieved_at, content_hash, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_id,
                rule["source_name"],
                rule["source_authority"],
                "EU" if "EUR-Lex" in rule["source_authority"] else "Platform",
                rule["source_url"],
                rule["effective_date"],
                now_iso(),
                uuid.uuid5(uuid.NAMESPACE_URL, rule["source_url"] + rule["effective_date"]).hex,
                "bundled_snapshot",
            ),
        )


def _add_event(
    conn: sqlite3.Connection,
    case_id: str,
    stage: str,
    label: str,
    status: str,
    detail: str,
) -> None:
    conn.execute(
        "INSERT INTO events (case_id, stage, label, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (case_id, stage, label, status, detail, now_iso()),
    )


def _replace_findings(conn: sqlite3.Connection, case: dict[str, Any]) -> list[dict[str, Any]]:
    # Evaluate before replacing persisted results.  Combined with transaction
    # rollback this preserves the last understandable result if evaluation fails.
    findings = evaluate_case(case)
    conn.execute("DELETE FROM findings WHERE case_id = ?", (case["id"],))
    timestamp = now_iso()
    for item in findings:
        finding_id = "finding-" + uuid.uuid4().hex[:12]
        conn.execute(
            """
            INSERT INTO findings (
                id, case_id, rule_id, severity, title, category, status,
                trigger_excerpt, evidence_quote, source_name, source_url,
                source_authority, effective_date, action, needs_human_review,
                reviewer_note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                finding_id,
                case["id"],
                item["rule_id"],
                item["severity"],
                item["title"],
                item["category"],
                item["status"],
                item["trigger_excerpt"],
                item["evidence_quote"],
                item["source_name"],
                item["source_url"],
                item["source_authority"],
                item["effective_date"],
                item["action"],
                1 if item["needs_human_review"] else 0,
                "",
                timestamp,
                timestamp,
            ),
        )
    score = readiness_score(findings)
    status, label = readiness_state(findings)
    stage = "内部审查已通过" if status == "ready" else "整改中"
    conn.execute(
        """
        UPDATE cases
        SET readiness = ?, status = ?, status_label = ?, current_stage = ?, updated_at = ?
        WHERE id = ?
        """,
        (score, status, label, stage, timestamp, case["id"]),
    )
    return findings


def _decode_case(row: sqlite3.Row) -> dict[str, Any]:
    case = dict(row)
    case["documents"] = json.loads(case.pop("documents_json"))
    case["labels"] = json.loads(case.pop("labels_json"))
    case["details"] = json.loads(case.pop("details_json"))
    case["retryable"] = bool(case.get("retryable"))
    coverage = case_market_coverage(case)
    # Persisted values are retained for auditability; the calculated coverage
    # is authoritative when catalog mappings evolve.
    case["coverage_tier"] = coverage["tier"]
    case["rule_pack"] = coverage["rule_pack"]
    case["coverage"] = coverage
    case["recovery"] = {
        "operation_state": case.get("operation_state", "idle"),
        "current_stage": case.get("current_stage", ""),
        "last_operation": case.get("last_operation", ""),
        "retryable": case["retryable"],
        "last_error": case.get("last_error", ""),
        "retry_endpoint": (
            f"/api/v2/cases/{case['id']}/recheck"
            if case.get("last_operation") == "recheck"
            else f"/api/v2/cases/{case['id']}/run"
        ),
    }
    return case


def list_cases() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM cases ORDER BY updated_at DESC").fetchall()
        return [_decode_case(row) for row in rows]


def get_case(case_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not row:
            return None
        case = _decode_case(row)
        case["findings"] = [
            {**dict(item), "needs_human_review": bool(item["needs_human_review"])}
            for item in conn.execute(
                """
                SELECT * FROM findings WHERE case_id = ?
                ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, created_at
                """,
                (case_id,),
            ).fetchall()
        ]
        case["events"] = [
            dict(item)
            for item in conn.execute(
                "SELECT * FROM events WHERE case_id = ? ORDER BY id", (case_id,)
            ).fetchall()
        ]
        case["uploaded_files"] = [
            dict(item)
            for item in conn.execute(
                """
                SELECT id, file_name, content_type, parser,
                LENGTH(extracted_text) AS extracted_characters, created_at
                FROM documents WHERE case_id = ?
                """,
                (case_id,),
            ).fetchall()
        ]
        return case


def create_case(payload: dict[str, Any]) -> dict[str, Any]:
    case_id = "case-" + uuid.uuid4().hex[:12]
    timestamp = now_iso()
    details = dict(payload.get("details", {}))
    if payload.get("market_id"):
        details["market_id"] = payload["market_id"]
    coverage = case_market_coverage({"market": payload.get("market", "欧盟 · 德国"), "details": details})
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO cases (
                id, sku, brand, product_name, market, platform, category,
                status, status_label, readiness, current_stage, claims,
                documents_json, labels_json, details_json, coverage_tier,
                rule_pack, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                payload["sku"],
                payload["brand"],
                payload["product_name"],
                payload.get("market", "欧盟 · 德国"),
                payload.get("platform", "Amazon EU"),
                payload.get("category", "智能小家电 / 个护电器"),
                "draft",
                "待开始审查",
                100,
                "资料接收",
                payload.get("claims", ""),
                json.dumps(payload.get("documents", []), ensure_ascii=False),
                json.dumps(payload.get("labels", []), ensure_ascii=False),
                json.dumps(details, ensure_ascii=False),
                coverage["tier"],
                coverage["rule_pack"] or "",
                timestamp,
                timestamp,
            ),
        )
        _add_event(conn, case_id, "ingest", "案件已创建", "complete", "等待资料审查")
    return get_case(case_id)  # type: ignore[return-value]


def _set_operation(
    case_id: str,
    operation: str,
    state: str,
    stage: str,
    *,
    retryable: bool = False,
    error: str = "",
    status: str | None = None,
    status_label: str | None = None,
    event_label: str | None = None,
    event_status: str | None = None,
    event_detail: str = "",
) -> None:
    assignments = [
        "operation_state = ?",
        "last_operation = ?",
        "current_stage = ?",
        "retryable = ?",
        "last_error = ?",
        "updated_at = ?",
    ]
    values: list[Any] = [state, operation, stage, 1 if retryable else 0, error, now_iso()]
    if status is not None:
        assignments.append("status = ?")
        values.append(status)
    if status_label is not None:
        assignments.append("status_label = ?")
        values.append(status_label)
    values.append(case_id)
    with connect() as conn:
        conn.execute(f"UPDATE cases SET {', '.join(assignments)} WHERE id = ?", values)
        if event_label:
            _add_event(
                conn,
                case_id,
                operation,
                event_label,
                event_status or state,
                event_detail,
            )


def mark_case_operation(case_id: str, operation: str, stage: str) -> None:
    _set_operation(
        case_id,
        operation,
        "running",
        stage,
        status="processing",
        status_label="处理中",
        event_label=f"{stage}已开始",
        event_status="active",
        event_detail="当前阶段已持久化；若中断可从案件详情查看重试入口。",
    )


def mark_case_failure(case_id: str, operation: str, public_error: str) -> None:
    _set_operation(
        case_id,
        operation,
        "failed",
        "处理失败，可重试",
        retryable=True,
        error=public_error,
        status="retryable_error",
        status_label="处理未完成，可重试",
        event_label="处理失败",
        event_status="failed",
        event_detail=public_error,
    )


def run_case(case_id: str, is_recheck: bool = False) -> dict[str, Any] | None:
    case = get_case(case_id)
    if not case:
        return None
    operation = "recheck" if is_recheck else "audit"
    coverage = case_market_coverage(case)
    if coverage["tier"] != "official_deterministic":
        with connect() as conn:
            conn.execute("DELETE FROM findings WHERE case_id = ?", (case_id,))
            conn.execute(
                """
                UPDATE cases SET readiness = 0, status = 'consultation_only',
                status_label = '仅限咨询，不可出具规则结论',
                current_stage = '等待官方规则包', coverage_tier = ?, rule_pack = '',
                operation_state = 'blocked_by_coverage', last_operation = ?,
                retryable = 1, last_error = '', updated_at = ? WHERE id = ?
                """,
                (coverage["tier"], operation, now_iso(), case_id),
            )
            _add_event(
                conn,
                case_id,
                "scope",
                "规则执行已停止",
                "needs_evidence",
                coverage["warning"],
            )
        return get_case(case_id)

    mark_case_operation(case_id, operation, "增量复检中" if is_recheck else "确定性规则审查中")
    try:
        with connect() as conn:
            row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
            if not row:
                return None
            evaluation_case = _decode_case(row)
            evaluation_case["coverage_tier"] = coverage["tier"]
            evaluation_case["extracted_texts"] = [
                item["extracted_text"]
                for item in conn.execute(
                    "SELECT extracted_text FROM documents WHERE case_id = ?", (case_id,)
                ).fetchall()
                if item["extracted_text"]
            ]
            findings = _replace_findings(conn, evaluation_case)
            label = "完成增量复检" if is_recheck else "完成规则与证据审查"
            detail = f"发现 {len(findings)} 个待处理问题；所有结论均绑定来源"
            conn.execute(
                """
                UPDATE cases SET operation_state = 'complete', last_operation = ?,
                retryable = 0, last_error = '', coverage_tier = ?, rule_pack = ?,
                updated_at = ? WHERE id = ?
                """,
                (operation, coverage["tier"], coverage["rule_pack"] or "", now_iso(), case_id),
            )
            _add_event(conn, case_id, operation, label, "complete", detail)
    except Exception as error:
        mark_case_failure(case_id, operation, f"规则审查未完成（{type(error).__name__}）")
    return get_case(case_id)


def update_materials(
    case_id: str,
    documents: list[str] | None = None,
    labels: list[str] | None = None,
    claims: str | None = None,
) -> dict[str, Any] | None:
    case = get_case(case_id)
    if not case:
        return None
    next_documents = documents if documents is not None else case["documents"]
    next_labels = labels if labels is not None else case["labels"]
    next_claims = claims if claims is not None else case["claims"]
    with connect() as conn:
        conn.execute(
            """
            UPDATE cases SET documents_json = ?, labels_json = ?, claims = ?,
            current_stage = '资料已更新', updated_at = ? WHERE id = ?
            """,
            (
                json.dumps(next_documents, ensure_ascii=False),
                json.dumps(next_labels, ensure_ascii=False),
                next_claims,
                now_iso(),
                case_id,
            ),
        )
        _add_event(conn, case_id, "remediation", "整改资料已更新", "complete", "等待增量复检")
    return get_case(case_id)


def resolve_finding(case_id: str, finding_id: str, note: str) -> dict[str, Any] | None:
    with connect() as conn:
        exists = conn.execute(
            "SELECT 1 FROM findings WHERE id = ? AND case_id = ?", (finding_id, case_id)
        ).fetchone()
        if not exists:
            return None
        conn.execute(
            """
            UPDATE findings SET status = 'resolved', reviewer_note = ?, updated_at = ?
            WHERE id = ? AND case_id = ?
            """,
            (note, now_iso(), finding_id, case_id),
        )
        rows = [
            dict(row)
            for row in conn.execute("SELECT * FROM findings WHERE case_id = ?", (case_id,)).fetchall()
        ]
        score = readiness_score(rows)
        status, label = readiness_state(rows)
        conn.execute(
            "UPDATE cases SET readiness = ?, status = ?, status_label = ?, updated_at = ? WHERE id = ?",
            (score, status, label, now_iso(), case_id),
        )
        _add_event(conn, case_id, "review", "人工关闭问题", "complete", note or "已确认整改证据")
    return get_case(case_id)


def add_document_record(
    case_id: str,
    file_name: str,
    file_path: str,
    content_type: str,
    parser: str,
    extracted_text: str,
) -> dict[str, Any]:
    doc_id = "doc-" + uuid.uuid4().hex[:12]
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO documents (
                id, case_id, file_name, file_path, content_type, parser, extracted_text, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (doc_id, case_id, file_name, file_path, content_type, parser, extracted_text, now_iso()),
        )
        case_row = conn.execute("SELECT documents_json FROM cases WHERE id = ?", (case_id,)).fetchone()
        documents = json.loads(case_row["documents_json"]) if case_row else []
        if file_name not in documents:
            documents.append(file_name)
        conn.execute(
            """
            UPDATE cases SET documents_json = ?, current_stage = '资料已解析，等待审查',
            operation_state = 'complete', last_operation = 'upload', retryable = 0,
            last_error = '', status = 'draft', status_label = '待开始审查', updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(documents, ensure_ascii=False), now_iso(), case_id),
        )
        _add_event(conn, case_id, "ingest", "上传资料已解析", "complete", f"{file_name} · {parser}")
    return {
        "id": doc_id,
        "file_name": file_name,
        "parser": parser,
        "stage": "资料已解析，等待审查",
        "operation_state": "complete",
        "retryable": False,
    }


def list_sources() -> list[dict[str, Any]]:
    with connect() as conn:
        return [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM source_snapshots ORDER BY authority, source_name"
            ).fetchall()
        ]


def dashboard() -> dict[str, Any]:
    cases = list_cases()
    with connect() as conn:
        open_findings = conn.execute(
            "SELECT COUNT(*) AS value FROM findings WHERE status != 'resolved'"
        ).fetchone()["value"]
        p0_findings = conn.execute(
            "SELECT COUNT(*) AS value FROM findings WHERE status != 'resolved' AND severity = 'P0'"
        ).fetchone()["value"]
        evidence_total = conn.execute("SELECT COUNT(*) AS value FROM findings").fetchone()["value"]
        evidence_linked = conn.execute(
            "SELECT COUNT(*) AS value FROM findings WHERE source_url != '' AND evidence_quote != ''"
        ).fetchone()["value"]
    average_readiness = round(sum(case["readiness"] for case in cases) / len(cases)) if cases else 0
    return {
        "cases": cases,
        "summary": {
            "active_cases": len(cases),
            "open_findings": open_findings,
            "p0_findings": p0_findings,
            "average_readiness": average_readiness,
            "evidence_coverage": round((evidence_linked / evidence_total) * 100) if evidence_total else 100,
        },
        "evaluation": {
            "dataset_size": 120,
            "p0_recall_target": 95,
            "false_clear_target": 2,
            "citation_validity_target": 98,
            "p95_latency_target": 120,
            "status": "benchmark_ready",
            "note": "目标值与当前实测值严格分栏，避免把目标包装成结果。",
        },
    }
