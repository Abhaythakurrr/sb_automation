# Resource Requirements — Stonebranch Automation Platform
## Response to Infrastructure Planning Request

---

## Overview

The Stonebranch Automation Platform is a web-based internal tool that automates job creation, agent control, and monitoring operations in Stonebranch Universal Automation Center (UAC) via its REST API. It consists of a Node.js backend API server and a Next.js frontend application.

---

## 1. Hosting Infrastructure

### Option A — Recommended: Internal Application Server (VM or Container)

| Component | Specification | Notes |
|---|---|---|
| **Application Server** | 2 vCPU, 4 GB RAM, 20 GB disk | Runs both backend and frontend |
| **OS** | RHEL 8+ / Ubuntu 22.04 LTS | Standard enterprise Linux |
| **Node.js Runtime** | v18 LTS or v20 LTS | Required for both services |
| **Network** | Internal network access to Stonebranch UAC | HTTPS outbound to UAC host |
| **Port** | 3000 (frontend), 3001 (backend) | Or behind a reverse proxy on port 443 |

### Option B — Container-based (Docker / Kubernetes)

| Component | Specification |
|---|---|
| **Container Runtime** | Docker 24+ or Kubernetes 1.28+ |
| **Frontend container** | 256 MB RAM, 0.5 vCPU |
| **Backend container** | 512 MB RAM, 1 vCPU |
| **Persistent volume** | 5 GB (for upload temp files and alert state) |

### Option C — Serverless (Azure Functions / AWS Lambda)

The backend can be deployed as serverless functions. This eliminates server management and scales automatically. Requires:
- Azure Functions or AWS Lambda with Node.js 18 runtime
- Azure Static Web Apps or AWS CloudFront for the frontend
- Azure Key Vault or AWS Secrets Manager for token storage

---

## 2. Access Requirements

| Access | Purpose | Who Raises |
|---|---|---|
| **Stonebranch UAC Service Account** | API token for the automation platform to call UAC REST API | Stonebranch L2 / Admin team |
| **UAC API Token** | Bearer token generated from the service account | Stonebranch Admin |
| **UAC Role Permissions** | Create, Read, Update, Delete on Tasks and Triggers | Stonebranch Admin |
| **Job Schedule Tool Access** | Permission to create/modify time triggers | Stonebranch Admin |
| **Network firewall rule** | Allow HTTPS from the app server to UAC host (port 443) | Network / Infra team |
| **MS Teams Incoming Webhook** | For agent offline and job failure notifications | Teams Admin / Channel Owner |
| **Internal DNS entry** (optional) | e.g. `sb-automation.adient.internal` pointing to the app server | DNS / Infra team |
| **SSL Certificate** (optional) | For HTTPS on the app server | PKI / Infra team |

---

## 3. Software Dependencies

All dependencies are open-source and installed via npm. No additional software licences required.

### Backend
| Package | Version | Purpose |
|---|---|---|
| Node.js | 18 LTS | Runtime |
| Express | 4.18 | API server framework |
| Axios | 1.6 | HTTP client for UAC API calls |
| Multer | 1.4 | File upload handling |
| SheetJS (xlsx) | 0.18 | Excel/CSV parsing |
| Zod | 3.22 | Input validation |
| Helmet | 7.1 | Security headers |
| express-rate-limit | 7.4 | Rate limiting |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| Next.js | 14 | React framework |
| React | 18 | UI |
| Tailwind CSS | 3.3 | Styling |
| Framer Motion | 12 | Animations |
| Zustand | 4.4 | State management |
| Axios | 1.6 | HTTP client |
| SheetJS (xlsx) | 0.18 | Excel generation |

---

## 4. Environment Variables Required

These must be set in the deployment environment — never in source code:

```
BASE_URL=https://adient.stonebranch.cloud        # Stonebranch UAC base URL
AUTH_TOKEN=<service-account-api-token>            # UAC API bearer token
TEAMS_WEBHOOK_URL=<teams-incoming-webhook-url>    # MS Teams channel webhook
BACKEND_PORT=3001                                 # Backend port
NODE_ENV=production                               # Environment flag
UPLOAD_DIR=/tmp/sb-uploads                        # Temp upload directory
MAX_FILE_SIZE=10485760                            # 10 MB file size limit
NEXT_PUBLIC_API_BASE_URL=https://sb-automation.adient.internal:3001
```

---

## 5. Estimated Effort for Deployment

| Task | Effort | Owner |
|---|---|---|
| Provision application server / container | 2–4 hours | Infra team |
| Create UAC service account + API token | 1 hour | Stonebranch Admin |
| Configure UAC role permissions | 1 hour | Stonebranch Admin |
| Set up firewall rules | 1–2 hours | Network team |
| Deploy application (npm install + build) | 1 hour | Developer |
| Configure environment variables | 30 minutes | Developer + Infra |
| Set up reverse proxy / SSL | 2 hours | Infra team |
| Configure Teams webhook | 30 minutes | Teams Admin |
| Smoke test end-to-end | 1 hour | Developer |
| **Total** | **~10–12 hours** | |

---

## 6. Ongoing Maintenance

| Item | Frequency | Effort |
|---|---|---|
| Node.js security updates | Monthly | 30 min |
| npm dependency updates | Monthly | 1 hour |
| UAC API token rotation | Per policy | 30 min |
| Teams webhook rotation | Per policy | 15 min |
| Log review | Weekly | 15 min |
| Disk cleanup (uploads) | Automated | None |

---

## 7. What Is NOT Required

- No database — state is stored in JSON files on disk (suitable for current scale)
- No message queue
- No additional software licences
- No VPN changes (uses existing internal network)
- No changes to Stonebranch UAC itself

---

*Prepared by Abhay Thakur*
*Stonebranch Automation Platform v1.0*
