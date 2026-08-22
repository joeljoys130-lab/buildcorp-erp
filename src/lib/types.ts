export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  username?: string;
  email: string;
  passwordHash?: string;
  name: string;
  role: string;
  organizationId?: string;
  department?: string;
  permissions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  organizationId?: string;
  userId?: string;
  username: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  timestamp: Date;
}

export interface Notification {
  id: string;
  organizationId?: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

// MODULE 1 - CEMENT LOAD UPDATION
export interface CementLoad {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  purchasedFrom: string;
  cementCompany: string;
  loadInTonne: number;
  loadInBags: number;
  amountPerLoad: number;
  paidAmount: number;
  balanceAmount: number;
  purchaseDate: Date;
  buyerName: string;
  invoiceNumber: string;
  remarks: string | null;
  workId: string | null;
  createdAt: Date;
  currentStockDate?: Date | null;
  currentStockQty?: number | null;
  currentStockUsed?: number | null;
  currentStockBalance?: number | null;
  currentStockUsedAmount?: number | null;
  currentStockBalanceAmount?: number | null;
  paymentPartyName?: string | null;
  paymentBillAmount?: number | null;
  paymentBillDate?: Date | null;
  paymentPaidAmount?: number | null;
  paymentBalanceAmount?: number | null;
  paymentRemarks?: string | null;
}

// MODULE 2 - ENTRY / WORK STATUS
export interface Entry {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  workName: string;
  amount: number;
  nameOfOffice: string;
  mlaMpName?: string;
  loaReceived: boolean;
  lastDateToExecuteAgreement: Date;
  amountOfStampPaperRequired: number;
  securityAmount: number;
  performanceGuarantee: number;
  dlpPeriodAsPerInLOA: string;
  agreementNo: string;
  siteHandoverDate: Date;
  workCompletionDateAsPerAgreement: Date;
  actualCompletionDate?: Date | null;
  wardMemberName?: string;
  wardMemberPhone?: string;
  overseerName?: string;
  overseerPhone?: string;
  executiveEngineerName?: string;
  executiveEngineerPhone?: string;
  assistantEngineerName?: string;
  assistantEngineerPhone?: string;
  blockEngineerName?: string;
  blockEngineerPhone?: string;
  status: 'Not Started' | 'Ongoing' | 'Pending' | 'Completed';
  paymentReceived: number;
  gstApplicable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// MODULE 3 - STOCK REGISTER
export interface StockRegisterItem {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  materialName: 'Cement' | 'RS1' | 'SS1' | 'VG30';
  inBarrel: number;
  inKg: number;
  inTonne: number;
  usedInTonne: number;
  balanceInTonne: number;
  updatedAt: Date;
}

// MODULE 4 - SITE MATERIALS USED
export interface SiteMaterial {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  entryId: string;
  type: 'to_deliver' | 'delivered';
  itemSlNo: string;
  specName: string;
  unit?: string;
  estimatedQuantity: number;
  deliveredQuantityInCft: number;
  balanceQuantityInCft: number;
  totalQuantityInSite: number;
  createdAt: Date;
}

// MODULE 5 - PRIVATE WORK
export interface PrivateWork {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  workName: string;
  approxAmount: number;
  location: string;
  relatedToContractWork?: string;
  siteVisitDate: Date;
  roadWorkNature: string;
  completedDate: Date;
  advanceReceived: number;
  approxFinalWorkAmount: number;
  paymentReceived: number;
  paymentBalance: number;
  remarks: string | null;
  gstApplicable: boolean;
  createdAt: Date;
  workType?: string;
  finalWorkAmount?: number;
  completionDate?: Date;
}

// MODULE 6 - TAR LOAD
export interface TarLoad {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  purchasedFrom: string;
  item: 'Cement' | 'RS1' | 'SS1' | 'VG30';
  quantityInKg: number;
  loadInNoOfPack: number;
  addressedOffice: string;
  paidAmount: number;
  balanceToBePaid: number;
  purchasedDate: Date;
  billingNameBuyer: string;
  remarks: string | null;
  amountPerLoad: number;
  workId: string | null;
  createdAt: Date;
  currentStockDate?: Date | null;
  currentStockQty?: number | null;
  currentStockUsed?: number | null;
  currentStockBalance?: number | null;
  currentStockUsedAmount?: number | null;
  currentStockBalanceAmount?: number | null;
  paymentPartyName?: string | null;
  paymentBillAmount?: number | null;
  paymentBillDate?: Date | null;
  paymentPaidAmount?: number | null;
  paymentBalanceAmount?: number | null;
  paymentRemarks?: string | null;
}

// MODULE 7 - WORK BASED ENTRY
export interface WorkBasedEntry {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  entryId: string;
  itemSlNo: string;
  itemName: string;
  subItemDescription?: string | null;
  itemQuantity: number;
  itemRateAsPerEstimate: number;
  totalAmountPerItem: number;
  itemUnit: string;
  createdAt: Date;
}

// MODULE 11 - EXPENSE
export interface Expense {
  id: string;
  organizationId?: string;
  ownerEmail?: string;
  workId: string;
  date: Date;
  description: string;
  amount: number;
  createdAt: Date;
}
