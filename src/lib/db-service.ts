/**
 * db-service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All business data operations go through this service.
 * PRIMARY path  → MongoDB Atlas via Prisma.
 * FALLBACK path → Empty arrays (returned when Atlas is unreachable).
 * Write operations always use the PRIMARY path and throw on failure.
 */

import prisma from './prisma';
import {
  CementLoad, Entry, StockRegisterItem, SiteMaterial,
  PrivateWork, TarLoad, WorkBasedEntry, Expense,
} from './types';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deep-serialise Prisma Date objects to plain JS values (required for RSC). */
function serialize<T>(obj: T): T {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/** Parse string dates into real Date objects for Prisma */
function parseDates<T extends Record<string, any>>(data: T, keys: (keyof T)[]): T {
  if (!data) return data;
  const clone = { ...data };
  for (const key of keys) {
    if (clone[key] === '') {
      clone[key] = null as any;
    } else if (clone[key] !== undefined && clone[key] !== null) {
      if (typeof clone[key] === 'string') {
        const d = new Date(clone[key]);
        if (!isNaN(d.getTime())) {
          clone[key] = d as any;
        } else {
          clone[key] = null as any;
        }
      }
    }
  }
  return clone;
}

function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Database query timed out')), ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** READ helper — executes Prisma query with safe 5s timeout and logs warnings if error occurs. */
async function readDb<T>(dbFn: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return serialize(await withTimeout(dbFn(), 5000));
  } catch (err) {
    console.warn('⚠️  DB Read Warning (using fallback):', (err as Error).message?.slice(0, 200));
    // Return fallback data gracefully
    return serialize(fallback());
  }
}

/** WRITE helper — always uses Prisma, throws on failure. */
async function writeDb<T>(dbFn: () => Promise<T>): Promise<T> {
  return serialize(await dbFn());
}

/** Helper to construct tenant isolation filter */
function buildTenantWhere(organizationId?: string, ownerEmail?: string): Record<string, any> {
  if (organizationId) {
    return { organizationId };
  }
  if (ownerEmail) {
    return { ownerEmail };
  }
  return { ownerEmail: 'unauthenticated@invalid' };
}

// ─────────────────────────────────────────────────────────────────────────────
// DbService
// ─────────────────────────────────────────────────────────────────────────────

class DbService {

  // ── STOCK REGISTER RECALCULATION HELPER ────────────────────────────────────

  async recalculateStockRegister(ownerEmail: string): Promise<void> {
    const defaults = ['Cement', 'RS1', 'SS1', 'VG30'] as const;
    
    // Ensure default stock items exist in batch
    const existingItems = await prisma.stockRegisterItem.findMany({
      where: { ownerEmail }
    });
    
    const existingMap = new Map(existingItems.map(item => [item.materialName, item]));
    const missing = defaults.filter(d => !existingMap.has(d));
    
    if (missing.length > 0) {
      await prisma.stockRegisterItem.createMany({
        data: missing.map(materialName => ({
          ownerEmail,
          materialName,
          inBarrel: 0,
          inKg: 0,
          inTonne: 0,
          usedInTonne: 0,
          balanceInTonne: 0
        }))
      });
      // Refresh list of items
      const refreshedItems = await prisma.stockRegisterItem.findMany({
        where: { ownerEmail }
      });
      refreshedItems.forEach(item => existingMap.set(item.materialName, item));
    }

    // Fetch all active loads and materials in parallel
    const [cementLoads, tarLoads, siteMaterials] = await Promise.all([
      prisma.cementLoad.findMany({
        where: {
          ownerEmail,
          deletedAt: null,
        }
      }),
      prisma.tarLoad.findMany({
        where: {
          ownerEmail,
          deletedAt: null,
        }
      }),
      prisma.siteMaterial.findMany({
        where: {
          ownerEmail,
          type: 'delivered',
          OR: [
            { deletedAt: { isSet: false } },
            { deletedAt: null }
          ]
        }
      })
    ]);

    // Calculate updates and perform them in parallel
    const updatePromises: Promise<any>[] = [];
    
    for (const materialName of defaults) {
      let inTonne = 0;
      let inKg = 0;
      let inBarrel = 0;
      let usedInTonne = 0;

      if (materialName === 'Cement') {
        // Sum from cement loads
        for (const cl of cementLoads) {
          inTonne += cl.loadInTonne;
          inKg += cl.loadInTonne * 1000;
        }
      }

      // Sum from tar loads matching this item
      for (const tl of tarLoads) {
        const itemLower = tl.item.toLowerCase();
        const matLower = materialName.toLowerCase();
        if (itemLower === matLower || (itemLower === 'vg 30' && matLower === 'vg30')) {
          inTonne += tl.quantityInKg / 1000;
          inKg += tl.quantityInKg;
          inBarrel += tl.loadInNoOfPack;
        }
      }

      // Sum from site materials used matching this item
      for (const sm of siteMaterials) {
        const smLower = sm.specName.toLowerCase();
        const matLower = materialName.toLowerCase();
        if (smLower === matLower || (smLower === 'vg 30' && matLower === 'vg30')) {
          usedInTonne += sm.deliveredQuantityInCft; // maps to usedInTonne in existing code
        }
      }

      const balanceInTonne = inTonne - usedInTonne;

      // Only update if the values have actually changed
      const current = existingMap.get(materialName);
      if (
        !current ||
        current.inBarrel !== inBarrel ||
        current.inKg !== inKg ||
        current.inTonne !== inTonne ||
        current.usedInTonne !== usedInTonne ||
        current.balanceInTonne !== balanceInTonne
      ) {
        updatePromises.push(
          prisma.stockRegisterItem.updateMany({
            where: { ownerEmail, materialName },
            data: { inBarrel, inKg, inTonne, usedInTonne, balanceInTonne }
          })
        );
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }
  }

  // ── MODULE 1 — CEMENT LOADS ───────────────────────────────────────────────

  async getCementLoads(ownerEmail: string): Promise<CementLoad[]> {
    return readDb(
      () => prisma.cementLoad.findMany({
        where: {
          ownerEmail,
          OR: [
            { deletedAt: { isSet: false } },
            { deletedAt: null }
          ]
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<CementLoad[]>,
      () => [] as CementLoad[],
    );
  }

  async createCementLoad(
    data: Omit<CementLoad, 'id' | 'balanceAmount' | 'createdAt'>,
    ownerEmail: string,
  ): Promise<CementLoad> {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Guarantee valid purchaseDate (fallback to today if missing/empty)
    let purchaseDate = data.purchaseDate ? new Date(data.purchaseDate) : new Date();
    if (isNaN(purchaseDate.getTime())) {
      purchaseDate = new Date();
    }
    if (purchaseDate > endOfToday) {
      throw new Error("Future dates are not allowed for purchase date");
    }

    const parsed = parseDates(data, ['currentStockDate', 'paymentBillDate']);
    delete (parsed as any).purchaseDate;
    const balanceAmount = (parsed.amountPerLoad || 0) - (parsed.paidAmount || 0);

    const created = await writeDb(() => prisma.cementLoad.create({
      data: {
        ...parsed,
        purchaseDate,
        balanceAmount,
        ownerEmail,
      } as any,
    })) as unknown as CementLoad;
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return created;
  }

  async updateCementLoad(
    id: string,
    updates: Partial<CementLoad>,
    ownerEmail: string,
  ): Promise<CementLoad | null> {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (updates.purchaseDate) {
      const pDate = new Date(updates.purchaseDate);
      if (!isNaN(pDate.getTime()) && pDate > endOfToday) {
        throw new Error("Future dates are not allowed for purchase date");
      }
    }

    const updated = await writeDb(async () => {
      const old = await prisma.cementLoad.findFirst({ where: { id, ownerEmail } });
      if (!old) return null;
      const parsedUpdates = parseDates(updates, ['purchaseDate', 'currentStockDate', 'paymentBillDate']);
      const payload = { ...parsedUpdates } as any;
      if (parsedUpdates.amountPerLoad !== undefined || parsedUpdates.paidAmount !== undefined) {
        payload.balanceAmount =
          (parsedUpdates.amountPerLoad ?? old.amountPerLoad) -
          (parsedUpdates.paidAmount ?? old.paidAmount);
      }
      return prisma.cementLoad.update({ where: { id }, data: payload });
    }) as unknown as CementLoad | null;
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return updated;
  }

  async deleteCementLoad(id: string, ownerEmail: string): Promise<boolean> {
    const result = await writeDb(async () => {
      await prisma.cementLoad.updateMany({
        where: { id, ownerEmail },
        data: { deletedAt: new Date() },
      });
      return true;
    });
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return result;
  }

  // ── MODULE 2 — ENTRIES ────────────────────────────────────────────────────

  async getEntries(ownerEmail: string): Promise<Entry[]> {
    return readDb(
      () => prisma.entry.findMany({
        where: {
          ownerEmail,
          OR: [
            { deletedAt: { isSet: false } },
            { deletedAt: null }
          ]
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<Entry[]>,
      () => [] as Entry[],
    );
  }

  async createEntry(
    data: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>,
    ownerEmail: string,
  ): Promise<Entry> {
    const today = new Date();

    let lastDateToExecuteAgreement = data.lastDateToExecuteAgreement ? new Date(data.lastDateToExecuteAgreement) : today;
    if (isNaN(lastDateToExecuteAgreement.getTime())) lastDateToExecuteAgreement = today;

    let siteHandoverDate = data.siteHandoverDate ? new Date(data.siteHandoverDate) : today;
    if (isNaN(siteHandoverDate.getTime())) siteHandoverDate = today;

    let workCompletionDateAsPerAgreement = data.workCompletionDateAsPerAgreement ? new Date(data.workCompletionDateAsPerAgreement) : today;
    if (isNaN(workCompletionDateAsPerAgreement.getTime())) workCompletionDateAsPerAgreement = today;

    const parsed = parseDates(data, ['actualCompletionDate']);
    delete (parsed as any).lastDateToExecuteAgreement;
    delete (parsed as any).siteHandoverDate;
    delete (parsed as any).workCompletionDateAsPerAgreement;

    return writeDb(() => prisma.entry.create({
      data: {
        ...parsed,
        lastDateToExecuteAgreement,
        siteHandoverDate,
        workCompletionDateAsPerAgreement,
        ownerEmail,
      } as any,
    })) as unknown as Promise<Entry>;
  }

  async updateEntry(
    id: string,
    updates: Partial<Entry>,
    ownerEmail: string,
  ): Promise<Entry | null> {
    return writeDb(async () => {
      const exists = await prisma.entry.findFirst({ where: { id, ownerEmail } });
      if (!exists) return null;
      const parsedUpdates = parseDates(updates, ['lastDateToExecuteAgreement', 'siteHandoverDate', 'workCompletionDateAsPerAgreement', 'actualCompletionDate']);
      return prisma.entry.update({ where: { id }, data: parsedUpdates as any });
    }) as unknown as Promise<Entry | null>;
  }

  async deleteEntry(id: string, ownerEmail: string): Promise<boolean> {
    return writeDb(async () => {
      await prisma.entry.updateMany({
        where: { id, ownerEmail },
        data: { deletedAt: new Date() },
      });
      return true;
    });
  }

  // ── MODULE 3 — STOCK REGISTER ─────────────────────────────────────────────

  async getStockRegister(ownerEmail: string): Promise<StockRegisterItem[]> {
    return readDb(
      async () => {
        await this.recalculateStockRegister(ownerEmail);
        const items = await prisma.stockRegisterItem.findMany({ where: { ownerEmail } });
        return items as unknown as StockRegisterItem[];
      },
      () => [
        { id: 'sr-1', materialName: 'Cement', inBarrel: 0, inKg: 0, inTonne: 0, usedInTonne: 0, balanceInTonne: 0, updatedAt: new Date() },
        { id: 'sr-2', materialName: 'RS1',    inBarrel: 0, inKg: 0, inTonne: 0, usedInTonne: 0, balanceInTonne: 0, updatedAt: new Date() },
        { id: 'sr-3', materialName: 'SS1',    inBarrel: 0, inKg: 0, inTonne: 0, usedInTonne: 0, balanceInTonne: 0, updatedAt: new Date() },
        { id: 'sr-4', materialName: 'VG30',   inBarrel: 0, inKg: 0, inTonne: 0, usedInTonne: 0, balanceInTonne: 0, updatedAt: new Date() },
      ] as StockRegisterItem[],
    );
  }

  async updateStockRegisterItem(
    id: string,
    updates: Partial<StockRegisterItem>,
    ownerEmail: string,
  ): Promise<StockRegisterItem | null> {
    return writeDb(async () => {
      const old = await prisma.stockRegisterItem.findFirst({ where: { id, ownerEmail } });
      if (!old) return null;
      const payload = { ...updates } as any;
      if (updates.inTonne !== undefined || updates.usedInTonne !== undefined) {
        payload.balanceInTonne =
          (updates.inTonne ?? old.inTonne) - (updates.usedInTonne ?? old.usedInTonne);
      }
      return prisma.stockRegisterItem.update({ where: { id }, data: payload });
    }) as unknown as Promise<StockRegisterItem | null>;
  }

  // ── MODULE 4 — SITE MATERIALS ─────────────────────────────────────────────

  private mapSpecToStock(specName: string): string | null {
    const map: Record<string, string> = {
      Cement: 'Cement', RS1: 'RS1', SS1: 'SS1', 'VG 30': 'VG30', VG30: 'VG30',
    };
    return map[specName] ?? null;
  }

  async getSiteMaterials(ownerEmail: string): Promise<SiteMaterial[]> {
    return readDb(
      () => prisma.siteMaterial.findMany({
        where: {
          ownerEmail,
          OR: [
            { deletedAt: { isSet: false } },
            { deletedAt: null }
          ]
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<SiteMaterial[]>,
      () => [] as SiteMaterial[],
    );
  }

  async createSiteMaterial(
    data: Omit<SiteMaterial, 'id' | 'balanceQuantityInCft' | 'totalQuantityInSite' | 'createdAt'>,
    ownerEmail: string,
  ): Promise<SiteMaterial> {
    const balanceQuantityInCft = data.estimatedQuantity - data.deliveredQuantityInCft;
    const totalQuantityInSite  = data.deliveredQuantityInCft;

    const created = await writeDb(async () => {
      return prisma.siteMaterial.create({
        data: { ...data, balanceQuantityInCft, totalQuantityInSite, ownerEmail } as any,
      });
    }) as unknown as SiteMaterial;
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return created;
  }

  async updateSiteMaterial(
    id: string,
    updates: Partial<SiteMaterial>,
    ownerEmail: string,
  ): Promise<SiteMaterial | null> {
    const updated = await writeDb(async () => {
      const old = await prisma.siteMaterial.findFirst({ where: { id, ownerEmail } });
      if (!old) return null;
      const payload = { ...updates } as any;
      if (updates.estimatedQuantity !== undefined || updates.deliveredQuantityInCft !== undefined) {
        payload.balanceQuantityInCft =
          (updates.estimatedQuantity ?? old.estimatedQuantity) -
          (updates.deliveredQuantityInCft ?? old.deliveredQuantityInCft);
        payload.totalQuantityInSite = updates.deliveredQuantityInCft ?? old.deliveredQuantityInCft;
      }
      return prisma.siteMaterial.update({ where: { id }, data: payload });
    }) as unknown as SiteMaterial | null;
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return updated;
  }

  async deleteSiteMaterial(id: string, ownerEmail: string): Promise<boolean> {
    const result = await writeDb(async () => {
      await prisma.siteMaterial.updateMany({
        where: { id, ownerEmail },
        data: { deletedAt: new Date() },
      });
      return true;
    });
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return result;
  }

  // ── MODULE 5 — PRIVATE WORKS ──────────────────────────────────────────────

  async getPrivateWorks(ownerEmail: string): Promise<PrivateWork[]> {
    return readDb(
      () => prisma.privateWork.findMany({
        where: {
          ownerEmail,
          OR: [
            { deletedAt: { isSet: false } },
            { deletedAt: null }
          ]
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<PrivateWork[]>,
      () => [] as PrivateWork[],
    );
  }

  async createPrivateWork(
    data: Omit<PrivateWork, 'id' | 'paymentBalance' | 'createdAt'>,
    ownerEmail: string,
  ): Promise<PrivateWork> {
    const parsed = parseDates(data, ['siteVisitDate', 'completedDate', 'completionDate']);
    const paymentBalance = parsed.approxFinalWorkAmount - parsed.paymentReceived;
    return writeDb(() => prisma.privateWork.create({
      data: { ...parsed, paymentBalance, ownerEmail } as any,
    })) as unknown as Promise<PrivateWork>;
  }

  async updatePrivateWork(
    id: string,
    updates: Partial<PrivateWork>,
    ownerEmail: string,
  ): Promise<PrivateWork | null> {
    return writeDb(async () => {
      const old = await prisma.privateWork.findFirst({ where: { id, ownerEmail } });
      if (!old) return null;
      const parsedUpdates = parseDates(updates, ['siteVisitDate', 'completedDate', 'completionDate']);
      const payload = { ...parsedUpdates } as any;
      if (parsedUpdates.approxFinalWorkAmount !== undefined || parsedUpdates.paymentReceived !== undefined) {
        payload.paymentBalance =
          (parsedUpdates.approxFinalWorkAmount ?? old.approxFinalWorkAmount) -
          (parsedUpdates.paymentReceived ?? old.paymentReceived);
      }
      return prisma.privateWork.update({ where: { id }, data: payload });
    }) as unknown as Promise<PrivateWork | null>;
  }

  async deletePrivateWork(id: string, ownerEmail: string): Promise<boolean> {
    return writeDb(async () => {
      await prisma.privateWork.updateMany({
        where: { id, ownerEmail },
        data: { deletedAt: new Date() },
      });
      return true;
    });
  }

  // ── MODULE 6 — TAR LOADS ──────────────────────────────────────────────────

  async getTarLoads(ownerEmail: string): Promise<TarLoad[]> {
    return readDb(
      () => prisma.tarLoad.findMany({
        where: {
          ownerEmail,
          OR: [
            { deletedAt: { isSet: false } },
            { deletedAt: null }
          ]
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<TarLoad[]>,
      () => [] as TarLoad[],
    );
  }

  async createTarLoad(
    data: Omit<TarLoad, 'id' | 'balanceToBePaid' | 'createdAt'>,
    ownerEmail: string,
  ): Promise<TarLoad> {
    const today = new Date();
    let purchasedDate = data.purchasedDate ? new Date(data.purchasedDate) : today;
    if (isNaN(purchasedDate.getTime())) purchasedDate = today;

    const parsed = parseDates(data, ['currentStockDate', 'paymentBillDate']);
    delete (parsed as any).purchasedDate;
    const balanceToBePaid = (parsed.amountPerLoad || 0) - (parsed.paidAmount || 0);

    const created = await writeDb(() => prisma.tarLoad.create({
      data: { ...parsed, purchasedDate, balanceToBePaid, ownerEmail } as any,
    })) as unknown as TarLoad;
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return created;
  }

  async updateTarLoad(
    id: string,
    updates: Partial<TarLoad>,
    ownerEmail: string,
  ): Promise<TarLoad | null> {
    const updated = await writeDb(async () => {
      const old = await prisma.tarLoad.findFirst({ where: { id, ownerEmail } });
      if (!old) return null;
      const parsedUpdates = parseDates(updates, ['purchasedDate', 'currentStockDate', 'paymentBillDate']);
      const payload = { ...parsedUpdates } as any;
      if (parsedUpdates.amountPerLoad !== undefined || parsedUpdates.paidAmount !== undefined) {
        payload.balanceToBePaid =
          (parsedUpdates.amountPerLoad ?? old.amountPerLoad) -
          (parsedUpdates.paidAmount ?? old.paidAmount);
      }
      return prisma.tarLoad.update({ where: { id }, data: payload });
    }) as unknown as TarLoad | null;
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return updated;
  }

  async deleteTarLoad(id: string, ownerEmail: string): Promise<boolean> {
    const result = await writeDb(async () => {
      await prisma.tarLoad.updateMany({
        where: { id, ownerEmail },
        data: { deletedAt: new Date() },
      });
      return true;
    });
    this.recalculateStockRegister(ownerEmail).catch(err => console.error("Recalculate stock register error:", err));
    return result;
  }

  // ── MODULE 7 — WORK BASED ENTRIES ─────────────────────────────────────────

  async getWorkBasedEntries(ownerEmail: string): Promise<WorkBasedEntry[]> {
    return readDb(
      () => prisma.workBasedEntry.findMany({
        where: { ownerEmail },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<WorkBasedEntry[]>,
      () => [] as WorkBasedEntry[],
    );
  }

  async createWorkBasedEntry(
    data: Omit<WorkBasedEntry, 'id' | 'totalAmountPerItem' | 'createdAt'>,
    ownerEmail: string,
  ): Promise<WorkBasedEntry> {
    const totalAmountPerItem = data.itemQuantity * data.itemRateAsPerEstimate;
    return writeDb(() => prisma.workBasedEntry.create({
      data: { ...data, totalAmountPerItem, ownerEmail } as any,
    })) as unknown as Promise<WorkBasedEntry>;
  }

  async updateWorkBasedEntry(
    id: string,
    updates: Partial<WorkBasedEntry>,
    ownerEmail: string,
  ): Promise<WorkBasedEntry | null> {
    return writeDb(async () => {
      const old = await prisma.workBasedEntry.findFirst({ where: { id, ownerEmail } });
      if (!old) return null;
      const payload = { ...updates } as any;
      if (updates.itemQuantity !== undefined || updates.itemRateAsPerEstimate !== undefined) {
        payload.totalAmountPerItem =
          (updates.itemQuantity ?? old.itemQuantity) *
          (updates.itemRateAsPerEstimate ?? old.itemRateAsPerEstimate);
      }
      return prisma.workBasedEntry.update({ where: { id }, data: payload });
    }) as unknown as Promise<WorkBasedEntry | null>;
  }

  async deleteWorkBasedEntry(id: string, ownerEmail: string): Promise<boolean> {
    return writeDb(async () => {
      await prisma.workBasedEntry.deleteMany({ where: { id, ownerEmail } });
      return true;
    });
  }

  // ── MODULE 11 — EXPENSES ──────────────────────────────────────────────────

  async getExpenses(ownerEmail: string): Promise<Expense[]> {
    return readDb(
      () => prisma.expense.findMany({
        where: {
          ownerEmail,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      }) as unknown as Promise<Expense[]>,
      () => [] as Expense[],
    );
  }

  async getExpensesByWorkId(workId: string, ownerEmail: string): Promise<Expense[]> {
    return readDb(
      () => prisma.expense.findMany({
        where: {
          workId,
          ownerEmail,
          deletedAt: null,
        },
        orderBy: { date: 'desc' },
      }) as unknown as Promise<Expense[]>,
      () => [] as Expense[],
    );
  }

  async createExpense(
    data: Omit<Expense, 'id' | 'createdAt'>,
    ownerEmail: string,
  ): Promise<Expense> {
    const parsed = parseDates(data, ['date']);
    return writeDb(() => prisma.expense.create({
      data: { ...parsed, ownerEmail } as any,
    })) as unknown as Promise<Expense>;
  }

  async updateExpense(
    id: string,
    updates: Partial<Expense>,
    ownerEmail: string,
  ): Promise<Expense | null> {
    return writeDb(async () => {
      const exists = await prisma.expense.findFirst({ where: { id, ownerEmail } });
      if (!exists) return null;
      const parsedUpdates = parseDates(updates, ['date']);
      return prisma.expense.update({ where: { id }, data: parsedUpdates as any });
    }) as unknown as Promise<Expense | null>;
  }

  async deleteExpense(id: string, ownerEmail: string): Promise<boolean> {
    return writeDb(async () => {
      await prisma.expense.updateMany({
        where: { id, ownerEmail },
        data: { deletedAt: new Date() },
      });
      return true;
    });
  }
}

export const dbService = new DbService();
