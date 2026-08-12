from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CaseCreate(BaseModel):
    sku: str = Field(min_length=2, max_length=80)
    brand: str = Field(min_length=1, max_length=120)
    product_name: str = Field(min_length=2, max_length=160)
    market: str = "欧盟 · 德国"
    market_id: str | None = Field(default=None, min_length=2, max_length=80)
    platform: str = "Amazon EU"
    category: str = "智能小家电 / 个护电器"
    claims: str = ""
    documents: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class MaterialsUpdate(BaseModel):
    documents: list[str] | None = None
    labels: list[str] | None = None
    claims: str | None = None


class FindingResolve(BaseModel):
    note: str = Field(default="已核验整改证据", max_length=500)


class AgentMissionCreate(BaseModel):
    product_name: str = Field(min_length=2, max_length=160)
    market_id: str = Field(min_length=2, max_length=80)
    platform: str = Field(default="Independent site", max_length=120)
    objective: str = Field(default="上市前合规预审", max_length=500)
    category: str = Field(default="消费品", max_length=120)
    case_id: str | None = None
