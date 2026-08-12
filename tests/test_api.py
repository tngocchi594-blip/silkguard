from fastapi.testclient import TestClient

from backend.database import connect
from backend.main import app


def _delete_case(case_id: str) -> None:
    with connect() as database:
        database.execute("DELETE FROM cases WHERE id = ?", (case_id,))


def test_seeded_case_and_dashboard(tmp_path, monkeypatch):
    client = TestClient(app)

    with client:
        health = client.get("/api/v2/health")
        assert health.status_code == 200
        assert health.json()["service"] == "SilkGuard V2"

        dashboard = client.get("/api/v2/dashboard")
        assert dashboard.status_code == 200
        assert dashboard.json()["summary"]["evidence_coverage"] == 100

        case = client.get("/api/v2/cases/case-eu-hairdryer-001")
        assert case.status_code == 200
        body = case.json()
        assert body["findings"]
        assert all(item["source_url"] for item in body["findings"])


def test_create_and_run_case():
    client = TestClient(app)
    with client:
        created = client.post(
            "/api/v2/cases",
            json={
                "sku": "TEST-API-001",
                "brand": "Test Brand",
                "product_name": "Test Hair Dryer",
                "market": "欧盟 · 德国",
                "platform": "Amazon EU",
            },
        )
        assert created.status_code == 201
        case_id = created.json()["id"]

        audited = client.post(f"/api/v2/cases/{case_id}/run")
        assert audited.status_code == 200
        assert audited.json()["status"] == "blocked"
        assert audited.json()["findings"]

    _delete_case(case_id)


def test_market_catalog_contains_open_source_examples():
    client = TestClient(app)
    with client:
        response = client.get("/api/v2/markets")
        assert response.status_code == 200
        body = response.json()
        assert body["summary"]["total"] == 4
        assert len(body["markets"]) == 4
        assert any(item["id"] == "eu" for item in body["markets"])
        assert any(item["id"] == "united-states" for item in body["markets"])


def test_agent_distinguishes_official_and_advisory_coverage():
    client = TestClient(app)
    with client:
        eu = client.post(
            "/api/v2/agent/runs",
            json={
                "product_name": "AERIS 高速吹风机",
                "market_id": "eu",
                "platform": "Amazon EU",
                "objective": "上市前合规预审",
            },
        )
        assert eu.status_code == 201
        assert eu.json()["coverage"]["can_issue_compliance_decision"] is True
        assert eu.json()["tool_calls"]

        us = client.post(
            "/api/v2/agent/runs",
            json={
                "product_name": "AERIS 高速吹风机",
                "market_id": "united-states",
                "platform": "Amazon US",
                "objective": "进入美国市场",
            },
        )
        assert us.status_code == 201
        assert us.json()["coverage"]["can_issue_compliance_decision"] is False
        assert us.json()["status"] == "needs_official_evidence"


def test_non_eu_case_is_consultation_only_and_never_runs_eu_rules(monkeypatch):
    def forbidden_evaluation(_case):
        raise AssertionError("EU engine must not run for advisory markets")

    monkeypatch.setattr("backend.database.evaluate_case", forbidden_evaluation)
    client = TestClient(app)
    with client:
        created = client.post(
            "/api/v2/cases",
            json={
                "sku": "TEST-US-001",
                "brand": "Test Brand",
                "product_name": "US Test Dryer",
                "market": "美国",
                "market_id": "united-states",
                "platform": "Amazon US",
            },
        )
        assert created.status_code == 201
        case_id = created.json()["id"]

        audited = client.post(f"/api/v2/cases/{case_id}/run")
        assert audited.status_code == 200
        body = audited.json()
        assert body["status"] == "consultation_only"
        assert body["findings"] == []
        assert body["coverage"]["tier"] == "advisory_only"
        assert body["coverage"]["can_issue_compliance_decision"] is False
        assert body["operation_state"] == "blocked_by_coverage"
        assert body["retryable"] is True

    _delete_case(case_id)


def test_uploaded_extracted_text_is_used_by_rule_review():
    client = TestClient(app)
    with client:
        created = client.post(
            "/api/v2/cases",
            json={
                "sku": "TEST-TEXT-001",
                "brand": "Test Brand",
                "product_name": "Evidence Text Dryer",
                "market": "欧盟 · 德国",
                "market_id": "eu",
                "platform": "Amazon EU",
            },
        )
        assert created.status_code == 201
        case_id = created.json()["id"]

        text = (
            "EU Declaration of Conformity\nEMC test report\nLVD safety report\n"
            "RoHS declaration\ncrossed-out wheeled bin\nEU Responsible Person\n"
            "Listing claim: 100% safe"
        )
        uploaded = client.post(
            f"/api/v2/cases/{case_id}/documents",
            files={"file": ("evidence.txt", text.encode("utf-8"), "text/plain")},
        )
        assert uploaded.status_code == 201
        assert uploaded.json()["extracted_characters"] > 0

        audited = client.post(f"/api/v2/cases/{case_id}/run")
        assert audited.status_code == 200
        body = audited.json()
        assert [item["rule_id"] for item in body["findings"]] == ["AMZ-CLAIM-ABS-001"]
        assert body["operation_state"] == "complete"
        assert body["uploaded_files"][0]["extracted_characters"] > 0

    _delete_case(case_id)


def test_failed_review_persists_retryable_stage_and_can_recover(monkeypatch):
    import backend.database as database_module

    original = database_module.evaluate_case
    client = TestClient(app)
    with client:
        created = client.post(
            "/api/v2/cases",
            json={
                "sku": "TEST-RECOVERY-001",
                "brand": "Test Brand",
                "product_name": "Recoverable Dryer",
                "market": "欧盟 · 德国",
                "market_id": "eu",
                "platform": "Amazon EU",
            },
        )
        assert created.status_code == 201
        case_id = created.json()["id"]

        def broken_evaluation(_case):
            raise RuntimeError("synthetic failure")

        monkeypatch.setattr(database_module, "evaluate_case", broken_evaluation)
        failed = client.post(f"/api/v2/cases/{case_id}/run")
        assert failed.status_code == 200
        failure_body = failed.json()
        assert failure_body["status"] == "retryable_error"
        assert failure_body["operation_state"] == "failed"
        assert failure_body["retryable"] is True
        assert failure_body["recovery"]["retry_endpoint"].endswith(f"/{case_id}/run")

        monkeypatch.setattr(database_module, "evaluate_case", original)
        recovered = client.post(f"/api/v2/cases/{case_id}/run")
        assert recovered.status_code == 200
        assert recovered.json()["operation_state"] == "complete"
        assert recovered.json()["retryable"] is False

    _delete_case(case_id)


def test_failed_upload_returns_and_persists_retry_information(monkeypatch):
    def broken_parser(_path, _content_type):
        raise RuntimeError("synthetic parser failure")

    monkeypatch.setattr("backend.main.parse_document", broken_parser)
    client = TestClient(app)
    with client:
        created = client.post(
            "/api/v2/cases",
            json={
                "sku": "TEST-UPLOAD-RECOVERY-001",
                "brand": "Test Brand",
                "product_name": "Upload Recovery Dryer",
                "market": "欧盟 · 德国",
                "market_id": "eu",
                "platform": "Amazon EU",
            },
        )
        assert created.status_code == 201
        case_id = created.json()["id"]

        failed = client.post(
            f"/api/v2/cases/{case_id}/documents",
            files={"file": ("broken.txt", b"content", "text/plain")},
        )
        assert failed.status_code == 500
        detail = failed.json()["detail"]
        assert detail["retryable"] is True
        assert detail["retry_endpoint"].endswith(f"/{case_id}/documents")

        persisted = client.get(f"/api/v2/cases/{case_id}")
        assert persisted.status_code == 200
        body = persisted.json()
        assert body["operation_state"] == "failed"
        assert body["last_operation"] == "upload"
        assert body["retryable"] is True
        assert body["current_stage"] == "处理失败，可重试"

    _delete_case(case_id)
