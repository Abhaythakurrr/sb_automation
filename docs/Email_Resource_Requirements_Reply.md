# Email Reply — Resource Requirements

**To:** [Requestor]
**Subject:** RE: Resources Required — Stonebranch Automation Platform

---

Hi [Name],

Thank you for reaching out. Please find below the resources required to implement and host the Stonebranch Automation Platform at the enterprise level.

---

## What We Are Deploying

A web-based internal automation platform that interfaces with the Stonebranch UAC REST API to automate job creation, agent control, and monitoring. It consists of two components:

- **Backend API server** — Node.js/Express, handles all UAC API communication
- **Frontend web application** — Next.js, the user interface

---

## Infrastructure Required

**Application Server (one of the following):**

- **VM:** 2 vCPU, 4 GB RAM, 20 GB disk — RHEL 8+ or Ubuntu 22.04 LTS
- **Container:** Docker or Kubernetes (preferred for enterprise deployment)
- **Serverless:** Azure Functions + Azure Static Web Apps (if preferred by GTS)

**Network:**
- Outbound HTTPS (port 443) from the app server to `adient.stonebranch.cloud`
- Outbound HTTPS (port 443) to MS Teams webhook endpoint (`hclo365.webhook.office.com`)
- Internal DNS entry (optional): e.g. `sb-automation.adient.internal`
- SSL certificate for HTTPS (if hosting internally)

---

## Access Required

| Access | Purpose | Raised By |
|---|---|---|
| Stonebranch UAC Service Account | Dedicated account for the platform to call the UAC REST API | Stonebranch Admin |
| UAC API Bearer Token | Generated from the service account | Stonebranch Admin |
| UAC Role: Create/Read/Update/Delete on Tasks and Triggers | Required for job creation and deletion automations | Stonebranch Admin |
| UAC Job Schedule Tool Access | Required to create and manage time triggers | Stonebranch Admin |
| MS Teams Incoming Webhook URL | For agent offline and job failure notifications | Teams Admin |
| Firewall rule: app server → UAC host (HTTPS) | Network connectivity | Network/Infra team |

---

## Software Dependencies

All open-source, no additional licences required:

- **Node.js 18 LTS** (runtime)
- **npm packages** — Express, Next.js, Axios, SheetJS, Zod, Helmet (all MIT/Apache licensed)

---

## Estimated Deployment Effort

| Task | Effort |
|---|---|
| Server provisioning | 2–4 hours (Infra team) |
| UAC service account + permissions | 2 hours (Stonebranch Admin) |
| Network/firewall configuration | 1–2 hours (Network team) |
| Application deployment | 1 hour (Developer) |
| SSL + reverse proxy setup | 2 hours (Infra team) |
| End-to-end testing | 1 hour |
| **Total** | **~10–12 hours** |

---

## Security Notes

The platform has been designed with enterprise security in mind:

- Bearer tokens are never stored in the browser — session-based authentication with server-side token storage
- All secrets managed via environment variables, never in source code
- Input validation on all API endpoints
- File upload security — magic bytes validation, formula injection prevention
- Security headers (Helmet.js), rate limiting, request logging with request IDs
- The codebase is being prepared for GTS governance review

I have also prepared a detailed **GTS Governance Readiness document** which covers the full security controls, known gaps, and pre-production checklist. I can share this separately for the governance review.

---

Please let me know if you need any additional details or if there are specific infrastructure standards I should align to.

Best regards,
Abhay Thakur
