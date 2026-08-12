from backend.rules_engine import evaluate_case, readiness_score, readiness_state


def test_incomplete_case_is_blocked_and_every_finding_has_evidence():
    case = {
        "documents": ["产品图片"],
        "labels": ["额定电压 220-240V"],
        "claims": "repairs damaged hair instantly and guarantees safe use",
    }
    findings = evaluate_case(case)

    assert findings
    assert any(item["severity"] == "P0" for item in findings)
    assert all(item["source_url"].startswith("https://") for item in findings)
    assert all(item["evidence_quote"] for item in findings)
    assert readiness_score(findings) < 100
    assert readiness_state(findings)[0] == "blocked"


def test_complete_case_with_safe_claims_can_pass_internal_review():
    case = {
        "documents": [
            "EU Declaration of Conformity",
            "EMC test report",
            "LVD safety report",
            "RoHS declaration",
        ],
        "labels": [
            "WEEE crossed-out wheeled bin",
            "EU Responsible Person name and address",
            "product model and serial number",
        ],
        "claims": "Fast drying with three temperature settings.",
    }
    findings = evaluate_case(case)

    assert findings == []
    assert readiness_score(findings) == 100
    assert readiness_state(findings) == ("ready", "内部审查已通过")


def test_uploaded_text_counts_as_documents_labels_and_claim_material():
    case = {
        "coverage_tier": "official_deterministic",
        "documents": ["generic-upload.txt"],
        "labels": [],
        "claims": "",
        "extracted_texts": [
            "EU Declaration of Conformity; EMC test report; LVD safety report; "
            "RoHS declaration; crossed-out wheeled bin; EU Responsible Person; "
            "marketing copy: 100% safe"
        ],
    }

    findings = evaluate_case(case)
    assert [item["rule_id"] for item in findings] == ["AMZ-CLAIM-ABS-001"]


def test_advisory_market_cannot_execute_eu_rules_even_when_called_directly():
    findings = evaluate_case(
        {
            "coverage_tier": "advisory_only",
            "documents": [],
            "labels": [],
            "claims": "100% safe",
        }
    )
    assert findings == []
