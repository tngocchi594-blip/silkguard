# SilkGuard

[![CI](https://github.com/tngocchi594-blip/silkguard/actions/workflows/ci.yml/badge.svg)](https://github.com/tngocchi594-blip/silkguard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Evidence-traceable pre-market compliance workflows for cross-border product teams.

![SilkGuard evidence dossier](public/assets/brand/evidence-dossier-1600.webp)

SilkGuard turns product documents into a reviewable case: it identifies the selected market, evaluates a versioned rule pack, links every finding to a source, creates remediation actions, and records human review and re-checks. The first deterministic rule pack covers an EU smart-appliance demo entering Amazon EU.

> [!IMPORTANT]
> SilkGuard is an internal readiness tool and an open-source prototype. It does not provide legal advice, certification, laboratory testing, marketplace approval, or a decision from any authority.

## Why this project exists

Compliance work is often split across spreadsheets, documents, chat messages, and unverifiable AI answers. SilkGuard keeps the evidence and the decision path together:

1. Create a case for a product, market, and marketplace.
2. Upload supporting documents or extracted text.
3. Run deterministic checks from a versioned rule pack.
4. Review source-linked findings and remediation actions.
5. Resolve findings with a human note and run an incremental re-check.
6. Optionally use an LLM to explain already-established findings; the model does not create legal requirements or approve a product.

## Current scope

- React and Vite review workspace
- FastAPI and SQLite backend
- Versioned EU smart-appliance rule snapshot with source URLs
- Document ingestion for text and PDF, with optional local OCR integration
- Human-review gates and auditable event history
- Optional DeepSeek explanations and Feishu remediation sync
- A deliberately small example market catalog; only the EU demo currently has a deterministic rule pack
- Offline/mock behavior when optional integrations are not configured

The repository intentionally excludes private credentials, uploaded customer documents, local databases, build outputs, and unlicensed data inherited from earlier internal prototypes.

## Quick start

Requirements:

- Python 3.10+
- Node.js 20+

On Windows, run:

```text
run.cmd
```

Or start it manually:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm ci
npm run build
.\.venv\Scripts\python -m backend.main
```

Open `http://127.0.0.1:8000`. API documentation is available at `http://127.0.0.1:8000/docs`.

For front-end development:

```powershell
.\.venv\Scripts\python -m backend.main
npm run dev
```

The Vite development server runs at `http://127.0.0.1:5173` and proxies `/api` to FastAPI.

## Configuration

Copy `.env.example` to `.env.local` and add only the integrations you need. Never commit `.env.local` or credentials.

Supported variables include:

- `DEEPSEEK_API_KEY`
- `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_BITABLE_APP_TOKEN`, `FEISHU_TABLE_ID`
- `AMAZON_SP_CLIENT_ID`, `AMAZON_SP_CLIENT_SECRET`, `AMAZON_SP_REFRESH_TOKEN`
- `SILKGUARD_DATA_DIR` and `SILKGUARD_DB_PATH`

The application works in local-first demo mode without third-party credentials.

## Architecture

```text
backend/
  main.py                    FastAPI routes and static application serving
  database.py                SQLite cases, findings, events, documents, and source snapshots
  rules_engine.py            Deterministic review and readiness calculation
  market_intelligence.py     Market catalog and evidence-tier boundaries
  agent_orchestrator.py      Review task orchestration
  integrations.py            Optional AI and collaboration adapters
  data/rules_eu_appliances.json
src/
  main.jsx                   Application shell and case workspace
  components/                Landing, review, and 3D presentation components
tests/
  test_rules_engine.py
  test_api.py
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the trust boundary and workflow.

## Maintenance

SilkGuard is maintained as a public, release-based project. The primary maintainer reviews incoming issues and pull requests, verifies changes to source-linked controls, manages releases, and keeps CI and security tooling operational. See [MAINTAINERS.md](MAINTAINERS.md) for the current responsibility map and [ROADMAP.md](ROADMAP.md) for planned work.

## Verification

```powershell
.\.venv\Scripts\python -m pytest -q
npm run build
```

GitHub Actions runs both checks on pushes and pull requests.

## Data and evidence boundaries

- `rules_eu_appliances.json` is a prototype rule snapshot. Each control carries a source URL and effective date, but maintainers must re-verify sources before operational use.
- The market catalog is navigation metadata. A market marked `advisory_only` cannot execute the EU rule pack or produce a compliance decision.
- Generated explanations are secondary to deterministic controls and human review.
- The fictional AERIS case is included only for demonstration.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md), not a public issue.

Third-party asset and dependency attribution is documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Code in this repository is licensed under the [MIT License](LICENSE). Third-party assets remain under their respective licenses and attribution requirements.
