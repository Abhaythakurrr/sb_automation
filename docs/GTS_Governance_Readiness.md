# GTS Governance Readiness Assessment
## Stonebranch Automation Platform

**Version:** 1.0
**Prepared by:** Abhay Thakur
**Status:** Ready for Review

---

## 1. Application Overview

| Attribute | Value |
|---|---|
| Application Name | Stonebranch Automation Platform |
| Type | Internal Web Application (API-driven) |
| Purpose | Automates Stonebranch UAC job creation, agent control, and monitoring |
| Users | Stonebranch L1/L2 Operations Team |
| Data Classification | Internal — no PII, no customer data |
| External Connectivity | Outbound HTTPS to Stonebranch UAC and MS Teams webhook only |
| Authentication | Session-based (token validated server-side, session ID in browser) |

---

## 2. Security Controls

### 2.1 Authentication & Session Management

| Control | Implementation | Status |
|---|---|---|
| Token never stored in browser | User enters token once → backend creates session ID → token stored in server memory only | Implemented |
| Session expiry | Sessions expire after 8 hours of inactivity, cleaned up every 30 minutes | Implemented |
| Session invalidation on disconnect | Session destroyed server-side on explicit disconnect | Implemented |
| No credentials in source code | All secrets via environment variables only | Implemented |
| No credentials in git history | `.gitignore` excludes `.env`, state files, scratch scripts | Implemented |

### 2.2 Input Validation

| Control | Implementation | Status |
|---|---|---|
| File upload validation | Magic bytes check + SheetJS parse validation + formula injection prevention | Implemented |
| API request validation | Zod schema validation on all POST/PUT endpoints | Implemented |
| File size limit | 10 MB maximum, configurable via env var | Implemented |
| File type restriction | Only `.xlsx`, `.ods`, `.csv` accepted — MIME + extension + magic bytes | Implemented |
| Formula injection prevention | Cells starting with `=`, `+`, `-`, `@` rejected | Implemented |
| External reference blocking | URLs in cell values rejected | Implemented |

### 2.3 API Security

| Control | Implementation | Status |
|---|---|---|
| Security headers | Helmet.js — X-Frame-Options, X-Content-Type-Options, HSTS, etc. | Implemented |
| Rate limiting | 200 req/min global, 20 req/min on execution/deletion endpoints | Implemented |
| CORS | Configured — restrict to internal domain in production | Configured |
| Error handling | Stack traces never exposed to client in production | Implemented |
| Request logging | All requests logged with request ID, method, path, status, duration | Implemented |
| Token never logged | Authorization headers excluded from all log output | Implemented |

### 2.4 Data Handling

| Control | Implementation | Status |
|---|---|---|
| Uploaded files deleted after parsing | Files removed from disk immediately after parsing | Implemented |
| No PII processed | Tool handles job names, scripts, schedules only — no personal data | Confirmed |
| Alert history retention | Last 200 alerts retained in JSON file on disk | Implemented |
| Scheduled jobs persistence | Stored in JSON file — contains tokens (see gap below) | Gap — see Section 4 |

---

## 3. Code Quality Standards

### 3.1 Language & Framework

| Standard | Value |
|---|---|
| Language | TypeScript (strict mode) — both frontend and backend |
| Frontend framework | Next.js 14 (React 18) |
| Backend framework | Express 4 (Node.js 18 LTS) |
| Type safety | TypeScript strict mode, Zod runtime validation |
| Linting | TypeScript compiler as linter (tsc --noEmit) |

### 3.2 Code Structure

| Standard | Implementation |
|---|---|
| Separation of concerns | Routes → Services → Utils — clear layering |
| Single responsibility | Each route file handles one domain (execution, agents, monitoring, deletion) |
| Error handling | Centralised error handler middleware, consistent response envelope |
| No hardcoded values | All configuration via environment variables |
| No dead code | Unused packages and files removed |
| Consistent naming | camelCase for variables/functions, PascalCase for types/classes |

### 3.3 API Design

| Standard | Implementation |
|---|---|
| RESTful conventions | GET for reads, POST for creates/actions, DELETE for deletions |
| Consistent response format | `{ success: boolean, data?: T, timestamp: string }` on all endpoints |
| HTTP status codes | 200 OK, 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Internal Error |
| Request IDs | Every request gets a UUID, returned in `X-Request-ID` header |
| Input validation | Zod schemas on all mutation endpoints |

---

## 4. Known Gaps and Remediation Plan

| Gap | Risk | Remediation | Priority |
|---|---|---|---|
| Scheduled jobs JSON file contains tokens in plaintext | Medium — disk compromise exposes tokens | Encrypt tokens at rest using AES-256 before writing to disk | High |
| No database — state in JSON files | Low — single instance, no concurrency issues at current scale | Migrate to PostgreSQL or SQLite for production scale | Medium |
| No RBAC — any connected user can perform all actions | Medium — all operations require a valid UAC token which already has its own permissions | Add role-based UI restrictions (read-only vs operator vs admin) | Medium |
| Git history may contain old tokens | High — tokens committed before security hardening | Run `git filter-repo` to purge historical commits | Immediate |
| No audit log for user actions | Medium — no record of who created/deleted which job | Add structured audit log with user identity, action, timestamp | Medium |
| CORS allows all origins | Low — internal tool, but should be restricted | Set `CORS_ORIGIN` env var to restrict to internal domain | Low |
| No automated tests | Medium — regressions possible | Add unit tests for payloadMapper, scheduleParser, agentResolver | Medium |

---

## 5. Compliance Checklist

| Requirement | Status | Notes |
|---|---|---|
| No hardcoded credentials | Pass | All secrets via env vars |
| No PII in logs | Pass | Only job names, statuses, request metadata logged |
| No PII in storage | Pass | No personal data processed |
| Secure communication | Pass | HTTPS to UAC, HTTPS for Teams webhook |
| Input sanitisation | Pass | Zod validation + file magic bytes check |
| Error messages safe | Pass | Stack traces suppressed in production |
| Dependency vulnerabilities | Review needed | Run `npm audit` before production deployment |
| Licence compliance | Pass | All dependencies are MIT or Apache 2.0 licensed |
| Data retention policy | Partial | Alert history: 200 records. Upload files: deleted immediately. Scheduled jobs: indefinite — needs policy |
| Incident response | Not defined | Define escalation path for platform failures |

---

## 6. Pre-Production Checklist

Before going live in production, the following must be completed:

- [ ] Revoke all development/test tokens used during development
- [ ] Generate new production service account token
- [ ] Run `git filter-repo` to purge old tokens from git history
- [ ] Set all environment variables in production deployment
- [ ] Restrict CORS to internal domain
- [ ] Run `npm audit` and patch any high/critical vulnerabilities
- [ ] Encrypt tokens in `scheduled_jobs.json`
- [ ] Configure log rotation for request logs
- [ ] Define data retention policy for alert history
- [ ] Define incident response procedure for platform failures
- [ ] Conduct internal security review with GTS team
- [ ] Document runbook for operations team

---

## 7. Architecture Diagram

```
[Browser]
    │
    │  HTTPS — X-Session-ID header only (token never in browser)
    ▼
[Automation Platform — Backend API]
    │  Node.js / Express
    │  Session store (in-memory)
    │  Rate limiting, security headers, request logging
    │
    │  HTTPS — Bearer token (server-side only)
    ▼
[Stonebranch UAC REST API v7.8]
    │
    │  Internal integration
    ▼
[ServiceNow]          [MS Teams]
(incident numbers     (alert notifications
 via operationalMemo)  via incoming webhook)
```

---

## 8. Contact

| Role | Name |
|---|---|
| Developer / Owner | Abhay Thakur |
| Stonebranch L2 | (to be confirmed) |
| GTS Review Contact | (to be confirmed) |

---

*This document is intended for GTS governance review and infrastructure planning.*
*Last updated: May 2026*
