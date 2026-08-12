# Roadmap

This roadmap describes intended maintenance work, not promised dates or compliance coverage.

## v0.2 — Reproducible public demo

- Add containerized local startup and a health-check command.
- Publish a non-sensitive demonstration deployment.
- Add end-to-end tests for case creation, evidence upload, review, and re-check.
- Document a repeatable maintainer release checklist.

## v0.3 — Rule-pack lifecycle

- Define a machine-readable schema for source retrieval and review metadata.
- Add rule-pack change proposals that cannot overwrite a released pack without review.
- Produce impact reports for cases affected by a rule version change.
- Expand regression fixtures for claims, labels, and technical documents.

## v0.4 — Maintainer automation

- Use Codex-assisted pull-request triage and test suggestions with human approval.
- Add release-note drafting from reviewed changes.
- Add source-drift monitoring that opens review tasks instead of changing rules automatically.
- Track API-credit usage by open-source maintenance workflow.

## Future coverage

New jurisdictions or product categories will be added only when maintainers can provide authoritative sources, effective dates, scope boundaries, tests, and a review owner. A catalog entry without that evidence remains `advisory_only` and cannot issue a compliance decision.

## How to help

Useful contributions include reproducible bug reports, accessibility reviews, documentation improvements, rule-schema design, test fixtures that contain no confidential data, and source-verification workflows. See [CONTRIBUTING.md](CONTRIBUTING.md).
