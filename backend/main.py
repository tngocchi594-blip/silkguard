from __future__ import annotations

import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import (
    PROJECT_ROOT,
    UPLOAD_DIR,
    add_document_record,
    create_case,
    dashboard,
    get_case,
    init_db,
    list_cases,
    list_sources,
    mark_case_failure,
    mark_case_operation,
    resolve_finding,
    run_case,
    update_materials,
)
from .document_parser import parse_document
from .integrations import (
    generate_ai_summary,
    integration_catalog,
    sync_case_to_feishu,
    test_deepseek_connection,
)
from .agent_orchestrator import run_agent_mission
from .market_intelligence import get_market, list_markets, market_summary
from .schemas import AgentMissionCreate, CaseCreate, FindingResolve, MaterialsUpdate


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="SilkGuard V2 · 丝路智审",
    version="2.0.0",
    description="证据驱动的出海商品准入与整改闭环智能体 API",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/v2/health")
def health() -> dict[str, Any]:
    connected = sum(item["status"] in {"connected", "public", "optional_local"} for item in integration_catalog())
    return {
        "ok": True,
        "service": "SilkGuard V2",
        "mode": os.getenv("SILKGUARD_MODE", "local-first"),
        "connected_integrations": connected,
        "disclaimer": "内部预审工具，不替代法律、认证或主管机关意见。",
    }


@app.get("/api/v2/dashboard")
def dashboard_api() -> dict[str, Any]:
    return dashboard()


@app.get("/api/v2/markets")
def markets_api(query: str = "", risk_level: str = "") -> dict[str, Any]:
    return {
        "summary": market_summary(),
        "markets": list_markets(query=query, risk_level=risk_level),
    }


@app.get("/api/v2/markets/{market_id}")
def market_detail_api(market_id: str) -> dict[str, Any]:
    market = get_market(market_id)
    if not market:
        raise HTTPException(status_code=404, detail="市场档案不存在")
    return market


@app.post("/api/v2/agent/runs", status_code=201)
async def agent_run_api(payload: AgentMissionCreate) -> dict[str, Any]:
    try:
        return await run_agent_mission(payload.model_dump())
    except ValueError as error:
        if str(error) == "market_not_found":
            raise HTTPException(status_code=404, detail="市场档案不存在") from error
        raise


@app.get("/api/v2/cases")
def cases_api() -> list[dict[str, Any]]:
    return list_cases()


@app.post("/api/v2/cases", status_code=201)
def create_case_api(payload: CaseCreate) -> dict[str, Any]:
    return create_case(payload.model_dump())


@app.get("/api/v2/cases/{case_id}")
def case_detail_api(case_id: str) -> dict[str, Any]:
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return case


@app.post("/api/v2/cases/{case_id}/run")
def run_case_api(case_id: str) -> dict[str, Any]:
    case = run_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return case


@app.post("/api/v2/cases/{case_id}/recheck")
def recheck_case_api(case_id: str) -> dict[str, Any]:
    case = run_case(case_id, is_recheck=True)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return case


@app.patch("/api/v2/cases/{case_id}/materials")
def update_materials_api(case_id: str, payload: MaterialsUpdate) -> dict[str, Any]:
    case = update_materials(case_id, payload.documents, payload.labels, payload.claims)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return case


@app.post("/api/v2/cases/{case_id}/findings/{finding_id}/resolve")
def resolve_finding_api(case_id: str, finding_id: str, payload: FindingResolve) -> dict[str, Any]:
    case = resolve_finding(case_id, finding_id, payload.note)
    if not case:
        raise HTTPException(status_code=404, detail="案件或问题不存在")
    return case


@app.post("/api/v2/cases/{case_id}/documents", status_code=201)
async def upload_document_api(
    case_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    if not get_case(case_id):
        raise HTTPException(status_code=404, detail="案件不存在")
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")
    safe_name = Path(file.filename).name
    case_dir = UPLOAD_DIR / case_id
    case_dir.mkdir(parents=True, exist_ok=True)
    destination = case_dir / safe_name
    mark_case_operation(case_id, "upload", "资料上传与解析中")
    try:
        with destination.open("wb") as output:
            shutil.copyfileobj(file.file, output)
        extracted_text, parser = parse_document(
            destination, file.content_type or "application/octet-stream"
        )
        record = add_document_record(
            case_id,
            safe_name,
            str(destination),
            file.content_type or "application/octet-stream",
            parser,
            extracted_text[:100_000],
        )
    except Exception as error:
        public_error = f"资料上传或解析未完成（{type(error).__name__}）"
        mark_case_failure(case_id, "upload", public_error)
        raise HTTPException(
            status_code=500,
            detail={
                "message": public_error,
                "case_id": case_id,
                "stage": "处理失败，可重试",
                "retryable": True,
                "retry_endpoint": f"/api/v2/cases/{case_id}/documents",
            },
        ) from error
    return {**record, "extracted_characters": len(extracted_text)}


@app.post("/api/v2/cases/{case_id}/ai-summary")
async def ai_summary_api(case_id: str) -> dict[str, Any]:
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return await generate_ai_summary(case)


@app.post("/api/v2/cases/{case_id}/feishu-sync")
async def feishu_sync_api(case_id: str) -> dict[str, Any]:
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    return await sync_case_to_feishu(case)


@app.get("/api/v2/integrations")
def integrations_api() -> list[dict[str, Any]]:
    return integration_catalog()


@app.post("/api/v2/integrations/deepseek/test")
async def deepseek_test_api() -> dict[str, Any]:
    return await test_deepseek_connection()


@app.get("/api/v2/sources")
def sources_api() -> list[dict[str, Any]]:
    return list_sources()


@app.post("/api/v2/sources/verify")
async def verify_sources_api() -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
        for source in list_sources():
            try:
                response = await client.get(source["source_url"], headers={"User-Agent": "SilkGuard-V2/2.0"})
                results.append(
                    {
                        "id": source["id"],
                        "source_url": source["source_url"],
                        "reachable": response.status_code < 400,
                        "status_code": response.status_code,
                    }
                )
            except Exception as error:
                results.append(
                    {
                        "id": source["id"],
                        "source_url": source["source_url"],
                        "reachable": False,
                        "error": type(error).__name__,
                    }
                )
    return {"verified": len(results), "results": results}


DIST_DIR = PROJECT_ROOT / "dist"
if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str) -> FileResponse:
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(
        status_code=503,
        detail="前端尚未构建，请先运行 npm install && npm run build。",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
