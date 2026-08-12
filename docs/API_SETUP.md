# Optional integration setup

SilkGuard runs in local-first demo mode without third-party credentials. Copy `.env.example` to `.env.local` only when enabling an integration.

## DeepSeek

Used only to explain deterministic findings and draft remediation text.

```text
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

The model must not invent regulations, penalties, cases, or a final approval decision. When the key is missing or the request fails, the application returns a deterministic fallback summary.

## Feishu

Used to create remediation records in a user-controlled Bitable.

```text
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_TABLE_ID=
```

Create an internal application with the minimum permissions required for the target table.

## Amazon Selling Partner API

Reserved for authorized, read-only marketplace metadata and listing-issue workflows.

```text
AMAZON_SP_CLIENT_ID=
AMAZON_SP_CLIENT_SECRET=
AMAZON_SP_REFRESH_TOKEN=
AMAZON_SP_REGION=eu
```

Do not claim authorization, automate listing publication, or include seller credentials in a demonstration repository.

## Credential handling

- Keep credentials in `.env.local` or a deployment secret manager.
- Never place secrets in React code, screenshots, logs, issues, sample documents, or Git history.
- Never print authorization headers, app secrets, or refresh tokens.
- Rotate a credential immediately if it is exposed.
