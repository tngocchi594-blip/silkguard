# Security policy

## Supported versions

Security fixes are applied to the latest release and the default branch.

## Reporting a vulnerability

Please do not disclose vulnerabilities, exposed credentials, or sensitive test data in a public issue. Use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, open a minimal issue asking the maintainers to establish a private contact channel without including exploit details.

Include the affected version, reproduction conditions, impact, and any suggested mitigation. Maintainers will acknowledge a valid report as soon as practical and coordinate disclosure after a fix is available.

## Secrets and uploaded documents

SilkGuard reads credentials from local environment files and stores runtime data outside source-controlled paths. Never commit `.env.local`, databases, logs, or uploaded product documents. If a credential is exposed, revoke or rotate it immediately; removing it from the latest file is not enough once it has entered Git history.
