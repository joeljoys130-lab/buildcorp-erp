# BuildCorp ERP — Product Requirement Document (PRD)

## 1. Executive Summary & Vision
**BuildCorp ERP** is an Enterprise Resource Planning platform tailored for civil engineering and construction firms managing public works contracts (PWD, NHAI, Water Resources), supplier logistics, material stock inventories, and financial profitability in real time.

---

## 2. Business Goals & User Personas
### Business Objectives
* **Contract Compliance**: Track regulatory milestones (LOA, agreement deadlines, stamp papers, DLP periods).
* **Inventory Control**: Log raw material deliveries (Cement, Tar/Bitumen) and eliminate material leakage.
* **Margin Visibility**: Provide real-time profit and loss calculations per work order including 18% GST simulations.

### User Personas
* **Executive Administrator**: Full read/write access to financial analytics, user RBAC, audit logs, and profitability.
* **Project Manager / Engineer**: Update site execution progress, BOQ quantities, and work completion dates.
* **Store / Logistics Manager**: Log supplier invoices for cement and bitumen tankers arriving at mixing plants.

---

## 3. Key Functional Features & Requirements

### Module 1: Authentication & RBAC
* Passwordless & Password-backed Email OTP authentication.
* Role-Based Access Control (Admin, Manager, Viewer) with multi-tenant data isolation (`organizationId`, `ownerEmail`).
* HttpOnly cookie session management with JWT tokens.

### Module 2: Cement & Tar Load Tracking
* Supplier invoice tracking, bag/tonne conversions, payment records, and remaining balances.
* Expandable inline details drawer showing complete remarks and financial breakdown.

### Module 3: Government & Private Work Entry
* LOA compliance tracking, stamp paper calculations, overseer contact details, and site handover dates.
* Non-tender private project registration with advance deposit tracking.

### Module 4: Stock Register & Reconciliations
* Real-time aggregation of Cement, Bitumen (VG30, RS1, SS1), and aggregates.
* Automated recalculation upon supplier load creations or site consumption entries.

### Module 5: Work-Based Entry (BOQ) & Progress Tracking
* Bill of Quantities (BOQ) creation with automatic server-side serial numbering (`#1.01`, `#1.02`).
* Milestone tracking (Not Started, In Progress, Completed).

### Module 6: Expense Management & Profitability Calculator
* Category-wise cost tracking (Labor, Equipment, Fuel, Site Transport).
* Automated project profit margin calculations taking revenue, material costs, expenses, and GST into account.

---

## 4. Non-Functional Requirements (NFRs)
* **Performance**: Sub-500ms API response latency and fast optimistic UI updates.
* **Security**: Zero clear-text passwords, tenant isolation on all database queries, and CORS/Helmet header protection.
* **Reliability**: MongoDB connection pooling and graceful error handling.
* **Scalability**: Stateless Next.js Server Actions and serverless-ready architecture.
