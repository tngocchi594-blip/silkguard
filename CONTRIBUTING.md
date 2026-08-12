# Contributing to SilkGuard

Thank you for helping improve evidence-traceable compliance workflows.

## Before you start

- Open an issue before a large behavior or data-model change.
- Do not submit customer documents, personal data, credentials, confidential policies, or proprietary datasets.
- Do not add a legal requirement without an authoritative source URL, jurisdiction, effective date, and a clear human-review boundary.
- Do not describe advisory data or model output as certification, legal advice, or government approval.

## Development

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
npm ci
.\.venv\Scripts\python -m pytest -q
npm run build
```

Keep changes focused and include tests for rule, API, state-transition, or recovery behavior. UI changes should remain usable with keyboard navigation and reduced-motion preferences.

## Rule-pack contributions

A rule change must include:

1. A stable rule identifier.
2. An authoritative source and direct URL.
3. Jurisdiction and effective/version date.
4. The exact control condition and remediation action.
5. Tests covering both matching and non-matching evidence.
6. A maintainer review before release.

## Pull requests

Explain what changed, why it changed, the evidence used, and how you validated it. By contributing, you agree that your contribution may be distributed under the repository's MIT license.
