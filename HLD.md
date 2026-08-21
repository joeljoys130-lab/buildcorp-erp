# BuildCorp ERP — High-Level Design (HLD) Document

## 1. System Architecture Overview

BuildCorp ERP uses a modern 3-Tier Architecture deployed on serverless infrastructure:

```
[ Client Browser (React 19 / Tailwind CSS / Framer Motion) ]
                         │  HTTP/HTTPS (REST API & Server Actions)
                         ▼
[ Application Layer: Next.js 16 (App Router & Pages Router) ]
    ├── Authentication Service (JWT / NodeMailer SMTP)
    ├── Multi-Tenant Isolation Middleware
    └── DB Service Abstraction Layer (Prisma ORM v6)
                         │  Prisma Wire Protocol
                         ▼
[ Database Layer: MongoDB Atlas (Multi-Tenant Collections) ]
```

---

## 2. Core Architectural Components

### Client Presentation Layer
* Built with **React 19**, **Next.js 16**, and **Tailwind CSS**.
* Employs an Optimistic UI pattern for instant user feedback during CRUD operations, reconciling local state with authoritative server IDs.

### Application Logic & Server Actions
* **Server Actions (`src/app/actions.ts`)**: Handles form submissions, server-side data validation via Zod schemas, and tenant scoping.
* **API Endpoints (`src/pages/api/`)**: Provides REST endpoints for authentication (`/api/auth/login`, `/api/verify-otp`, `/api/logout`).

### Data Access & Multi-Tenancy Layer
* **Prisma ORM**: Manages database queries against MongoDB Atlas.
* **Tenant Isolation**: Every database query is automatically scoped with `ownerEmail` or `organizationId` to ensure total multi-tenant data privacy.
* **Connection Resilience**: Query wrappers (`readDb`, `writeDb`) provide connection retry logic and strict timeout limits to maintain high availability under cloud network latency.

---

## 3. Security Architecture
* **Token Strategy**: Stateless JWT tokens stored in HttpOnly, SameSite=Strict, Secure cookies.
* **Password Hashing**: Passwords stored using bcrypt with high cost factors.
* **OTP Security**: Expiration timers (5 minutes), single-use invalidation, and rate limiting (max 3 requests per 15 minutes).
* **API Security**: Request body sanitization, security headers (Helmet), and strict CORS policies.
