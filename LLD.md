# BuildCorp ERP — Low-Level Design (LLD) Document

## 1. Database Schema Specifications (Prisma / MongoDB)

### Core Models & Schemas

#### User & Organization
* `User`: `id`, `email`, `passwordHash`, `name`, `role`, `organizationId`, `createdAt`
* `Organization`: `id`, `name`, `code`, `ownerEmail`, `createdAt`

#### Modules
* `CementLoad`: `id`, `purchasedFrom`, `cementCompany`, `loadInTonne`, `loadInBags`, `amountPerLoad`, `paidAmount`, `balanceToBePaid`, `purchaseDate`, `buyerName`, `invoiceNumber`, `remarks`, `ownerEmail`, `deletedAt`
* `TarLoad`: `id`, `purchasedFrom`, `item`, `quantityInKg`, `loadInNoOfPack`, `addressedOffice`, `amountPerLoad`, `paidAmount`, `balanceToBePaid`, `purchasedDate`, `billingNameBuyer`, `remarks`, `ownerEmail`, `deletedAt`
* `Entry (Contract Work)`: `id`, `workName`, `amount`, `nameOfOffice`, `loaReceived`, `lastDateToExecuteAgreement`, `amountOfStampPaperRequired`, `securityAmount`, `performanceGuarantee`, `dlpPeriodAsPerInLOA`, `agreementNo`, `siteHandoverDate`, `workCompletionDateAsPerAgreement`, `status`, `ownerEmail`, `deletedAt`
* `WorkBasedEntry (BOQ)`: `id`, `entryId`, `itemSlNo`, `itemName`, `itemQuantity`, `itemRateAsPerEstimate`, `totalAmountPerItem`, `itemUnit`, `ownerEmail`
* `Expense`: `id`, `workId`, `date`, `description`, `amount`, `ownerEmail`, `deletedAt`
* `StockRegisterItem`: `id`, `materialName`, `unit`, `inTonne`, `inBags`, `ownerEmail`

---

## 2. API Contract & Handler Specifications

### Authentication API Endpoints
* `POST /api/auth/login`: Authenticates password and triggers Email OTP generation.
* `POST /api/verify-otp`: Validates 6-digit OTP token and sets HttpOnly session JWT cookie.
* `POST /api/logout`: Clears session cookie and invalidates client session.

### Key Server Actions (`src/app/actions.ts`)
* `createCementLoadAction(data)`: Validates input, calculates remaining balance, calls `dbService.createCementLoad`, and triggers async stock recalculation.
* `createEntryAction(data)`: Parses dates with safe fallbacks, creates contract work entry, and returns authoritative model.
* `createWorkBasedEntryAction(data)`: Generates server-side serial numbers and computes `totalAmountPerItem`.

---

## 3. UI Component Class & Functional Structure

### Module View Components (`src/components/views/modules.tsx`)
* `CementLoadView`: Manages supplier load forms, optimistic pending items array, and expandable inline details.
* `EntryView`: Manages public works contract entries, status updates, and LOA milestone alerts.
* `WorkBasedEntryView`: Implements BOQ item forms with construction suggestion dropdowns and automatic item numbering.
* `StockRegisterView`: Displays aggregated stock balances with manual adjustment triggers.
