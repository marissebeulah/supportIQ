# Project Plan

**Status**: Awaiting Integration
**Created**: 2026-11-04
**Mode**: AUGMENT

---

## 1. Project Overview

**Goal**: Continue the existing SupportIQ customer, IT-agent, and administrator portals and API, delivering role-specific ticket workflows, support-only assistance, secure attachments, and measurable service quality. Keep local development and testing on the installed XAMPP MariaDB server as the first milestone; Azure deployment remains a later optional phase. Keep each portal, API route, and persistence adapter independently testable.

**App Type**: SPA + API

**API Login**: Yes

**Mode**: AUGMENT

**Deployment Plan**: No deployment plan found

---

## 2. SupportIQ API — Node.js with Express

| Component | Technology |
|-----------|-----------|
| **Language** | TypeScript |
| **Runtime** | Node |
| **Package Manager** | npm |
| **Test Runner** | vitest |
| **Mocking Library** | vi.mock |
| **Test Command** | npm test |
| **Orchestration** | docker-compose |

Preserve the existing Express API boundary and route organization while moving toward the selected TypeScript service contracts. The first local milestone uses XAMPP MariaDB and local attachment files; keep the persistence and attachment boundaries replaceable so PostgreSQL and Blob Storage can be considered only in a separately approved Azure phase. Preserve support-only assistant replies, ticket and conversation history, service metrics, and admin-managed support content.

---

## 3. SupportIQ Web Portal — React + Vite

| Component | Technology |
|-----------|-----------|
| **Language** | TypeScript |
| **Framework** | React + Vite |
| **Package Manager** | npm |
| **Test Runner** | vitest |
| **Mocking Library** | vi.mock |
| **Test Command** | npm test |

Keep the existing three role-based experiences: customers can use a support-only assistant, contact IT, create requests with attachments, track progress, and rate support; agents can triage and reply to tickets; administrators can review tickets and conversations, monitor service metrics, reassign or join conversations, and manage approved automated replies. Keep customer communications inside SupportIQ and provide accessible loading, empty, error, and confirmation states.

---

## 4. Services Required

Azure resources below are future deployment targets only. The first milestone runs the existing Node/Vite app locally with XAMPP MariaDB and local attachment files.

| Azure Service | Role in App | Environment Variable | Default Value (Local) | Classification |
|---------------|------------|---------------------|----------------------|----------------|
| Azure Static Web Apps | Host the React/Vite customer and staff portals in the later Azure phase | `VITE_API_BASE_URL` | `http://localhost:3000/api` | Essential |
| Azure App Service (Linux, Node.js) | Host the Express support API in the later Azure phase | `PORT` | `3000` | Essential |
| Azure Database for PostgreSQL Flexible Server | Persistent Azure records for users, tickets, messages, settings, ratings, and metrics | `DATABASE_URL` | `mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3306/supportiq` (XAMPP MariaDB locally) | Essential |
| Azure Blob Storage | Store private ticket screenshots and attachments in Azure; use local files during the first milestone | `STORAGE_CONNECTION_STRING` | `./uploads` (local filesystem) | Essential |

---

## 5. Prerequisites

Run tools reflect the local-first stack. Debugging extras include browser debugging and optional containers for a later Azure-service emulation workflow. Double-check every ❓ tool before using that optional workflow.

### Run

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Node.js | * | ✅ | 26.13.0 |
| npm | * | ✅ | 11.20.0 |
| XAMPP MariaDB | SupportIQ API | ✅ | 10.11.16 |

### Debug

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| `ms-vscode.js-debug` (JavaScript Debugger) | SupportIQ Web Portal, SupportIQ API | ✅ | 1.140.0 |
| Chrome | SupportIQ Web Portal | ✅ | 156.0.8078.80 |
| Docker | Azure Database for PostgreSQL Flexible Server, Azure Blob Storage | ❓ | — |
| Docker Compose | Azure Database for PostgreSQL Flexible Server, Azure Blob Storage | ❓ | — |

The local-first milestone does not require Docker. Double-check the ❓ Docker tools before enabling optional PostgreSQL or Blob Storage emulators.

---

## 6. Design System & UI

**Component Library**: Fluent UI v9
**Style Direction**: A calm, high-trust IT service console with clear role-aware navigation, compact ticket tables, and quiet blue-green emphasis for actionable states. Use restrained warm accents for urgency, subtle elevation, and crisp 4–8px corners so dense support work remains easy to scan.
**Typography**: Inter, system-ui

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#176B87` | SupportIQ actions, active portal navigation, and ticket links |
| `accent`  | `#D97745` | SLA urgency, selected highlights, and customer-facing emphasis |
| `surface` | `#F4F7F9` | Portal canvas behind ticket tables, conversations, and metric cards |
| `text`    | `#172B3A` | Ticket subjects, conversation text, and metric values |
| `muted`   | `#647787` | Assignees, timestamps, hints, and secondary ticket metadata |
| `border`  | `#D9E2E8` | Ticket separators, form outlines, and portal card edges |

### Pages

| Page | Route | Purpose | Layout |
|------|-------|---------|--------|
| Customer Support | `/` | Find help, contact IT, create a request, and track personal tickets. | `header, nav, hero, grid, two-column(card-list+form), footer` |
| Agent Work Queue | `/agent` | Triage assigned and unassigned support requests and respond in context. | `header, sidebar, main, tabs, table, two-column(card-list+main)` |
| Admin Operations | `/admin` | Review service health, late tickets, conversations, and managed automated replies. | `header, sidebar, main, grid, two-column(table+card-list), footer` |

### Sample Content

Customer Support — ticket:
| Ticket | Subject | Updated | Status |
|--------|---------|---------|--------|
| `SI-4821` | VPN disconnects during video calls | 10:42 AM | In progress |
| `SI-4798` | Add Jordan Lee to Finance shared mailbox | Yesterday | Waiting on IT |
| `SI-4762` | BitLocker recovery key request | Oct 31 | Resolved |

Agent Work Queue — ticket:
| Ticket | Subject | Requester | Priority |
|--------|---------|-----------|----------|
| `SI-4834` | New starter cannot access payroll | Priya Nair | Urgent |
| `SI-4821` | VPN disconnects during video calls | Maya Chen | High |
| `SI-4830` | Cannot print to 4th-floor device | Oliver Grant | Normal |

Admin Operations — service metric and managed reply:
| Metric / Reply | Value / Trigger | Detail / Last reviewed | State |
|---------------|-----------------|------------------------|-------|
| SLA met | 94.2% | 7-day rolling window | On target |
| Median first response | 18 min | 7-day rolling window | Improving |
| Late tickets | 7 | 3 need reassignment | Attention |
| Satisfaction | 4.7 / 5 | 126 customer ratings | On target |
| VPN troubleshooting steps | VPN, disconnect | Nov 2 | Enabled |
| Shared mailbox access checklist | mailbox, access | Oct 28 | Enabled |
| BitLocker recovery guidance | BitLocker, recovery | Oct 21 | Draft |

---

## 7. Project Structure

Preserve the repository's existing `src/`, `server/`, `data/`, and root npm layout; extend the existing paths rather than replacing them.

```text
SupportIQ/
├── .azure/
│   ├── project-plan.md
│   └── .preview-temp/
├── data/
│   └── supportiq.db                 # Existing data; first milestone targets XAMPP MariaDB
├── src/
│   ├── components/                   # Shared portal, ticket, and UI components
│   ├── lib/                          # API client, hooks, types, and formatting
│   ├── pages/
│   │   ├── customer/                 # Home, assistant, request creation, request tracking
│   │   ├── agent/                    # Queue and ticket work
│   │   └── admin/                    # Overview, conversations, team, automation
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── server/
│   ├── routes/                       # Auth, ticket, bot, admin, and upload endpoints
│   ├── persistence/                  # Planned MariaDB adapter and later Azure adapter boundary
│   ├── db.js                         # Existing persistence entry point
│   └── index.js                      # Existing Express API entry point
├── scripts/                          # Existing development and database utilities
├── package.json                      # Existing npm scripts and dependencies
├── tsconfig.json
└── vite.config.ts
```

---

## 8. Route Definitions

| # | Method | Path | Description | Request Body | Response Body | Status Codes |
|---|--------|------|-------------|-------------|--------------|-------------|
| 1 | GET | `/api/health` | Report API and required data-store readiness | — | `{ status, services }` | 200, 503 |
| 2 | GET | `/api/tickets` | List tickets with supported status, assignee, and search filters | Query parameters | `{ items, page, total }` | 200, 400 |
| 3 | POST | `/api/tickets` | Create a customer support request | `{ subject, description, category, priority?, attachments? }` | `{ ticket }` | 201, 422 |
| 4 | GET | `/api/tickets/:id` | Return ticket details and its conversation | — | `{ ticket, messages }` | 200, 404 |
| 5 | POST | `/api/tickets/:id/messages` | Add a customer or agent reply | `{ message, attachmentIds? }` | `{ message }` | 201, 404, 422 |
| 6 | PATCH | `/api/tickets/:id/status` | Change ticket status and record the activity | `{ status }` | `{ ticket }` | 200, 404, 422 |
| 7 | PATCH | `/api/tickets/:id/assign` | Assign or reassign a ticket | `{ assigneeId }` | `{ ticket }` | 200, 404, 422 |
| 8 | POST | `/api/tickets/:id/rating` | Record a customer satisfaction rating | `{ score, comment? }` | `{ rating }` | 201, 404, 422 |
| 9 | GET | `/api/bot/conversation` | Return the current support-assistant conversation and suggestions | — | `{ conversationId, messages, suggestions }` | 200 |
| 10 | POST | `/api/bot/messages` | Return a support-only answer or escalation recommendation | `{ message }` | `{ conversationId, messages, suggestions, recommendTicket }` | 200, 400, 409 |
| 11 | GET | `/api/admin/overview` | Return service-quality metrics and overview data | — | `{ metrics, tickets, agents }` | 200 |
| 12 | GET | `/api/admin/conversations` | Review support-assistant conversations and escalation totals | Query parameters | `{ conversations, stats }` | 200 |
| 13 | GET | `/api/admin/settings` | Read support automation, knowledge, and canned-reply settings | — | `{ settings, sla, kb, cannedReplies }` | 200 |
| 14 | PUT | `/api/admin/settings` | Update support automation text, enablement, or service targets | `{ bot_enabled?, bot_greeting?, sla? }` | `{ settings, sla, kb, cannedReplies }` | 200, 400 |
| 15 | POST | `/api/uploads` | Stage a ticket attachment in local storage for the first milestone | Multipart file | `{ attachmentId, name, contentType, size }` | 201, 413, 415 |
| 16 | GET | `/api/attachments/:id` | Retrieve an attachment through the application | — | File response | 200, 404 |

---

## 9. Next Steps

1. Review and approve this plan in the plan preview.
2. Run **azure-project-scaffold** to augment the existing frontend and API.
3. Run **azure-project-integrate** to create/verify migrations, wire live API data, and smoke-test endpoints.
4. Run **azure-debug-plan** → **azure-debug-generate** for local database/blob emulators and VS Code debugging.
5. Run the **azure-deploy** agent when ready; it uses **azure-app-onboard** for architecture, cost estimation, IaC generation, provisioning, and health verification.
