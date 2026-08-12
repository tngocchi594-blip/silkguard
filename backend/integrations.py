from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ENV = Path(__file__).resolve().parent / ".env.local"
load_dotenv(BACKEND_ENV, override=False)
load_dotenv(PROJECT_ROOT / ".env.local", override=False)


def _configured(*names: str) -> bool:
    return all(bool(os.getenv(name)) for name in names)


def integration_catalog() -> list[dict[str, Any]]:
    return [
        {
            "id": "deepseek",
            "name": "DeepSeek API",
            "category": "模型推理",
            "status": "connected" if _configured("DEEPSEEK_API_KEY") else "needs_key",
            "description": "结构化解释、整改建议与合规 Listing 草稿；不承担规则判定。",
            "register_url": "https://platform.deepseek.com/",
            "docs_url": "https://api-docs.deepseek.com/",
            "required_env": ["DEEPSEEK_API_KEY"],
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "configured_via": "backend/.env.local" if BACKEND_ENV.exists() else ".env.local",
        },
        {
            "id": "eurlex",
            "name": "EUR-Lex / CELLAR",
            "category": "官方法规",
            "status": "public",
            "description": "欧盟法规原文、版本与生效信息，不需要账户密钥。",
            "register_url": "https://eur-lex.europa.eu/content/tools/webservices/index.html",
            "docs_url": "https://eur-lex.europa.eu/content/tools/webservices/DataExtractionUsingWebServices.pdf",
            "required_env": [],
        },
        {
            "id": "safetygate",
            "name": "EU Safety Gate",
            "category": "产品安全",
            "status": "public",
            "description": "危险非食品产品通报与召回案例开放数据。",
            "register_url": "https://ec.europa.eu/safety-gate-alerts/screen/webReport",
            "docs_url": "https://data.europa.eu/data/datasets/rapex-rapid-alert-system-non-food?locale=en",
            "required_env": [],
        },
        {
            "id": "amazon",
            "name": "Amazon Selling Partner API",
            "category": "平台规则",
            "status": "connected"
            if _configured("AMAZON_SP_CLIENT_ID", "AMAZON_SP_CLIENT_SECRET", "AMAZON_SP_REFRESH_TOKEN")
            else "needs_oauth",
            "description": "商品类型定义、字段要求与 Listing Issues；需要卖家授权。",
            "register_url": "https://sellercentral.amazon.com/sellingpartner/developerconsole",
            "docs_url": "https://developer-docs.amazon.com/sp-api/lang-en_EN/docs/registering-your-application",
            "required_env": [
                "AMAZON_SP_CLIENT_ID",
                "AMAZON_SP_CLIENT_SECRET",
                "AMAZON_SP_REFRESH_TOKEN",
            ],
        },
        {
            "id": "feishu",
            "name": "飞书开放平台",
            "category": "整改协同",
            "status": "connected"
            if _configured(
                "FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_BITABLE_APP_TOKEN", "FEISHU_TABLE_ID"
            )
            else "needs_key",
            "description": "将审查问题写入多维表格，形成负责人、期限和复检状态闭环。",
            "register_url": "https://open.feishu.cn/app",
            "docs_url": "https://open.feishu.cn/document/home/quick-access-to-base/preparation",
            "required_env": [
                "FEISHU_APP_ID",
                "FEISHU_APP_SECRET",
                "FEISHU_BITABLE_APP_TOKEN",
                "FEISHU_TABLE_ID",
            ],
        },
        {
            "id": "paddleocr",
            "name": "PaddleOCR 3.x",
            "category": "本地文档解析",
            "status": "optional_local",
            "description": "优先在本机解析铭牌、说明书和测试报告，降低资料外传风险。",
            "register_url": "https://paddlepaddle.github.io/PaddleOCR/main/en/quick_start.html",
            "docs_url": "https://paddlepaddle.github.io/PaddleOCR/main/en/index.html",
            "required_env": [],
        },
        {
            "id": "ofac",
            "name": "OFAC Sanctions List Service",
            "category": "制裁筛查",
            "status": "public_later",
            "description": "美国制裁名单查询与数据下载，用于美国及物流扩展场景。",
            "register_url": "https://ofac.treasury.gov/sanctions-list-service",
            "docs_url": "https://ofac.treasury.gov/other-ofac-sanctions-lists",
            "required_env": [],
        },
        {
            "id": "ecfr",
            "name": "eCFR / Federal Register",
            "category": "美国法规",
            "status": "public_later",
            "description": "美国现行法规与法规动态，无需 API Key。",
            "register_url": "https://www.ecfr.gov/developers/documentation/api/v1",
            "docs_url": "https://www.federalregister.gov/developers/documentation/api/v1",
            "required_env": [],
        },
    ]


async def generate_ai_summary(case: dict[str, Any]) -> dict[str, Any]:
    findings = case.get("findings", [])
    fallback = {
        "provider": "deterministic-fallback",
        "summary": f"{case['product_name']} 当前有 {len(findings)} 个待处理问题，其中 "
        f"{sum(item['severity'] == 'P0' for item in findings)} 个为阻断项。建议先补齐技术文件与责任主体信息，再处理平台文案。",
        "next_actions": [item["action"] for item in findings[:3]],
        "disclaimer": "该结论用于企业内部预审，不替代律师、认证机构或主管机关意见。",
    }
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return fallback

    payload = {
        "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        "temperature": 0.1,
        "max_tokens": 1200,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 SilkGuard 的合规整改解释器。规则与来源已经由确定性引擎给出，"
                    "不得增加未提供的法规、费用、罚款或案例。输出 JSON，字段为 summary、next_actions、disclaimer。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "product": case["product_name"],
                        "market": case["market"],
                        "platform": case["platform"],
                        "findings": [
                            {
                                "severity": item["severity"],
                                "title": item["title"],
                                "evidence": item["evidence_quote"],
                                "action": item["action"],
                            }
                            for item in findings
                        ],
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            result = json.loads(content)
            return {"provider": "deepseek", **result}
    except Exception as error:
        return {**fallback, "fallback_reason": type(error).__name__}


async def test_deepseek_connection() -> dict[str, Any]:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    if not api_key:
        return {
            "ok": False,
            "provider": "deepseek",
            "model": model,
            "error": "missing_api_key",
        }

    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 80,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "Return JSON only. You are performing a SilkGuard backend connectivity check. "
                    'The response schema is {"ok": true, "service": "silkguard"}.'
                ),
            },
            {
                "role": "user",
                "content": "Run the connectivity check and return the required JSON object.",
            },
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            result = json.loads(content)
            return {
                "ok": bool(result.get("ok")),
                "provider": "deepseek",
                "model": model,
                "service": result.get("service", "silkguard"),
            }
    except httpx.HTTPStatusError as error:
        return {
            "ok": False,
            "provider": "deepseek",
            "model": model,
            "error": "upstream_http_error",
            "status_code": error.response.status_code,
        }
    except Exception as error:
        return {
            "ok": False,
            "provider": "deepseek",
            "model": model,
            "error": type(error).__name__,
        }


async def sync_case_to_feishu(case: dict[str, Any]) -> dict[str, Any]:
    app_id = os.getenv("FEISHU_APP_ID")
    app_secret = os.getenv("FEISHU_APP_SECRET")
    app_token = os.getenv("FEISHU_BITABLE_APP_TOKEN")
    table_id = os.getenv("FEISHU_TABLE_ID")
    records = [
        {
            "fields": {
                "SKU": case["sku"],
                "商品": case["product_name"],
                "市场": case["market"],
                "问题等级": item["severity"],
                "问题": item["title"],
                "规则编号": item["rule_id"],
                "整改建议": item["action"],
                "状态": "待复核" if item["needs_human_review"] else "待整改",
                "证据链接": item["source_url"],
            }
        }
        for item in case.get("findings", [])[:50]
    ]
    if not all([app_id, app_secret, app_token, table_id]):
        return {
            "provider": "local-preview",
            "synced": False,
            "record_count": len(records),
            "message": "飞书凭证尚未配置；已生成可写入的数据预览。",
            "records": records,
        }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            token_response = await client.post(
                "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                json={"app_id": app_id, "app_secret": app_secret},
            )
            token_response.raise_for_status()
            token = token_response.json()["tenant_access_token"]
            write_response = await client.post(
                f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create",
                headers={"Authorization": f"Bearer {token}"},
                json={"records": records},
            )
            write_response.raise_for_status()
            body = write_response.json()
            if body.get("code") != 0:
                raise RuntimeError(body.get("msg", "Feishu write failed"))
            return {
                "provider": "feishu",
                "synced": True,
                "record_count": len(records),
                "message": "整改任务已写入飞书多维表格。",
            }
    except Exception as error:
        return {
            "provider": "local-preview",
            "synced": False,
            "record_count": len(records),
            "message": f"飞书调用失败，已保留本地预览：{type(error).__name__}",
            "records": records,
        }
