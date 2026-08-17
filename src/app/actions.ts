"use server";

import { cookies } from 'next/headers';
import { dbService } from '@/lib/db-service';
import { getTenantContextFromToken, assertPermission } from '@/lib/auth/tenant';
import {
  CementLoad, Entry, StockRegisterItem, SiteMaterial,
  PrivateWork, TarLoad, WorkBasedEntry, Expense,
} from '@/lib/types';

// ── Auth & Tenant Context helper ───────────────────────────────────────────────

/** Read the JWT cookie and return the active TenantContext. Throws if unauthorized. */
async function getTenantContext() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) throw new Error('Not authenticated');
  const context = await getTenantContextFromToken(token);
  if (!context) throw new Error('Invalid or expired session');
  return context;
}

// ── Cement Loads ──────────────────────────────────────────────────────────────

export async function getCementLoadsAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'CEMENT_VIEW');
  return dbService.getCementLoads(ctx.email);
}

export async function createCementLoadAction(data: Omit<CementLoad, 'id' | 'balanceAmount' | 'createdAt'>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'CEMENT_CREATE');
  return dbService.createCementLoad(data, ctx.email);
}

export async function updateCementLoadAction(id: string, data: Partial<CementLoad>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'CEMENT_UPDATE');
  return dbService.updateCementLoad(id, data, ctx.email);
}

export async function deleteCementLoadAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'CEMENT_DELETE');
  return dbService.deleteCementLoad(id, ctx.email);
}

// ── Entries (Contract Work) ───────────────────────────────────────────────────

export async function getEntriesAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PROJECT_VIEW');
  return dbService.getEntries(ctx.email);
}

export async function createEntryAction(data: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PROJECT_CREATE');
  return dbService.createEntry(data, ctx.email);
}

export async function updateEntryAction(id: string, data: Partial<Entry>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PROJECT_UPDATE');
  return dbService.updateEntry(id, data, ctx.email);
}

export async function deleteEntryAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PROJECT_DELETE');
  return dbService.deleteEntry(id, ctx.email);
}

// ── Stock Register ────────────────────────────────────────────────────────────

export async function getStockRegisterAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'STOCK_VIEW');
  return dbService.getStockRegister(ctx.email);
}

export async function updateStockRegisterItemAction(id: string, data: Partial<StockRegisterItem>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'STOCK_UPDATE');
  return dbService.updateStockRegisterItem(id, data, ctx.email);
}

// ── Site Materials ────────────────────────────────────────────────────────────

export async function getSiteMaterialsAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'MATERIAL_VIEW');
  return dbService.getSiteMaterials(ctx.email);
}

export async function createSiteMaterialAction(
  data: Omit<SiteMaterial, 'id' | 'balanceQuantityInCft' | 'totalQuantityInSite' | 'createdAt'>,
) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'MATERIAL_CREATE');
  return dbService.createSiteMaterial(data, ctx.email);
}

export async function updateSiteMaterialAction(id: string, data: Partial<SiteMaterial>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'MATERIAL_UPDATE');
  return dbService.updateSiteMaterial(id, data, ctx.email);
}

export async function deleteSiteMaterialAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'MATERIAL_DELETE');
  return dbService.deleteSiteMaterial(id, ctx.email);
}

// ── Private Works ─────────────────────────────────────────────────────────────

export async function getPrivateWorksAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PRIVATE_WORK_VIEW');
  return dbService.getPrivateWorks(ctx.email);
}

export async function createPrivateWorkAction(data: Omit<PrivateWork, 'id' | 'paymentBalance' | 'createdAt'>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PRIVATE_WORK_CREATE');
  return dbService.createPrivateWork(data, ctx.email);
}

export async function updatePrivateWorkAction(id: string, data: Partial<PrivateWork>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PRIVATE_WORK_UPDATE');
  return dbService.updatePrivateWork(id, data, ctx.email);
}

export async function deletePrivateWorkAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'PRIVATE_WORK_DELETE');
  return dbService.deletePrivateWork(id, ctx.email);
}

// ── Tar Loads ─────────────────────────────────────────────────────────────────

export async function getTarLoadsAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'TAR_VIEW');
  return dbService.getTarLoads(ctx.email);
}

export async function createTarLoadAction(data: Omit<TarLoad, 'id' | 'balanceToBePaid' | 'createdAt'>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'TAR_CREATE');
  return dbService.createTarLoad(data, ctx.email);
}

export async function updateTarLoadAction(id: string, data: Partial<TarLoad>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'TAR_UPDATE');
  return dbService.updateTarLoad(id, data, ctx.email);
}

export async function deleteTarLoadAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'TAR_DELETE');
  return dbService.deleteTarLoad(id, ctx.email);
}

// ── Work Based Entries ────────────────────────────────────────────────────────

export async function getWorkBasedEntriesAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'WORK_BASED_ENTRY_VIEW');
  return dbService.getWorkBasedEntries(ctx.email);
}

export async function createWorkBasedEntryAction(
  data: Omit<WorkBasedEntry, 'id' | 'totalAmountPerItem' | 'createdAt'>,
) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'WORK_BASED_ENTRY_CREATE');
  return dbService.createWorkBasedEntry(data, ctx.email);
}

export async function updateWorkBasedEntryAction(id: string, data: Partial<WorkBasedEntry>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'WORK_BASED_ENTRY_UPDATE');
  return dbService.updateWorkBasedEntry(id, data, ctx.email);
}

export async function deleteWorkBasedEntryAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'WORK_BASED_ENTRY_DELETE');
  return dbService.deleteWorkBasedEntry(id, ctx.email);
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function getExpensesAction() {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'EXPENSE_VIEW');
  return dbService.getExpenses(ctx.email);
}

export async function getExpensesByWorkIdAction(workId: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'EXPENSE_VIEW');
  return dbService.getExpensesByWorkId(workId, ctx.email);
}

export async function createExpenseAction(data: Omit<Expense, 'id' | 'createdAt'>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'EXPENSE_CREATE');
  return dbService.createExpense(data, ctx.email);
}

export async function updateExpenseAction(id: string, data: Partial<Expense>) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'EXPENSE_UPDATE');
  return dbService.updateExpense(id, data, ctx.email);
}

export async function deleteExpenseAction(id: string) {
  const ctx = await getTenantContext();
  assertPermission(ctx, 'EXPENSE_DELETE');
  return dbService.deleteExpense(id, ctx.email);
}

export async function getDashboardDataAction() {
  const ctx = await getTenantContext();
  const [cl, ent, stk, sm, pw, tl, wbe, exp] = await Promise.all([
    dbService.getCementLoads(ctx.email),
    dbService.getEntries(ctx.email),
    dbService.getStockRegister(ctx.email),
    dbService.getSiteMaterials(ctx.email),
    dbService.getPrivateWorks(ctx.email),
    dbService.getTarLoads(ctx.email),
    dbService.getWorkBasedEntries(ctx.email),
    dbService.getExpenses(ctx.email)
  ]);
  return {
    cementLoads: cl,
    entries: ent,
    stockRegister: stk,
    siteMaterials: sm,
    privateWorks: pw,
    tarLoads: tl,
    workBasedEntries: wbe,
    expenses: exp
  };
}

// ── Misc (kept for compatibility) ─────────────────────────────────────────────

export async function getNotificationsAction() { return []; }
export async function markNotificationReadAction(_id: string) { return true; }
export async function markAllNotificationsReadAction() { return true; }
export async function getAuditLogsAction() { return []; }
export async function loginAction(_data: { username: string; passwordHash: string }) {
  return { success: true, user: null, error: undefined as string | undefined };
}
export async function logoutAction() { return { success: true }; }
export async function getCurrentUser() { return null; }
