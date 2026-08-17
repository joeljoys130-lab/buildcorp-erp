"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Plus, Search, FileDown, Edit2, Trash2, Calendar, FileText, CheckCircle, 
  AlertCircle, X, ChevronRight, Filter, Printer
} from "lucide-react";
import { 
  CementLoad, Entry, StockRegisterItem, SiteMaterial, 
  PrivateWork, TarLoad, WorkBasedEntry, Expense 
} from "@/lib/types";

// Common helper for CSV exports
const exportCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map(obj => 
    Object.values(obj).map(val => {
      let str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(",")
  );
  const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const formatDate = (date: any): string => {
  if (!date) return "";
  const d = typeof date === 'string' ? new Date(date) : date;
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toISOString().substring(0, 10);
  }
  return "";
};

// ==========================================
// MODULE 1 – CEMENT LOAD UPDATION
// ==========================================

// Single form state object — replacing 22 individual useState calls.
// This is the key fix: clearForm() now calls ONE setState instead of 22,
// eliminating the multi-render cascade that was blocking the browser from
// painting the optimistic row.
const CEMENT_FORM_EMPTY = {
  purchasedFrom: "",
  cementCompany: "",
  loadInTonne: 0,
  loadInBags: 0,
  amountPerLoad: 0,
  paidAmount: 0,
  purchaseDate: "",
  buyerName: "",
  invoiceNumber: "",
  remarks: "",
  currentStockDate: "",
  currentStockQty: 0,
  currentStockUsed: 0,
  currentStockUsedAmount: 0,
  currentStockBalanceAmount: 0,
  paymentPartyName: "",
  paymentBillAmount: 0,
  paymentBillDate: "",
  paymentPaidAmount: 0,
  paymentRemarks: "",
};
type CementFormState = typeof CEMENT_FORM_EMPTY;

export function CementLoadView({
  cementLoads,
  onRefresh,
  onCreateCementLoad,
  onUpdateCementLoad,
  onDeleteCementLoad,
  onOptimisticUpdate,
  onNavigate
}: {
  cementLoads: CementLoad[];
  onRefresh: () => void;
  onCreateCementLoad: (data: any) => Promise<any>;
  onUpdateCementLoad: (id: string, data: any) => Promise<any>;
  onDeleteCementLoad: (id: string) => Promise<any>;
  onOptimisticUpdate?: (updatedItem: CementLoad) => void;
  onNavigate: (tab: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Single form state object — ONE setState replaces 22 individual setters.
  const [form, setForm] = useState<CementFormState>(CEMENT_FORM_EMPTY);
  const setField = <K extends keyof CementFormState>(key: K, value: CementFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // Holds items that are pending server confirmation (e.g., newly added loads).
  // These use temp IDs (e.g. "temp-abc123") that are replaced by the real DB
  // ID when the server responds. We do NOT use a useEffect to clean these up
  // based on cementLoads — that approach fails because temp IDs never match
  // real MongoDB IDs.  Cleanup is handled explicitly inside handleSave.
  const [pendingCementLoads, setPendingCementLoads] = useState<CementLoad[]>([]);

  // Search/Filter
  const [searchQuery, setSearchQuery] = useState("");

  const displayedCementLoads = useMemo(() => {
    const combined = [...pendingCementLoads, ...cementLoads];
    if (!searchQuery) return combined;
    const q = searchQuery.toLowerCase();
    return combined.filter(c =>
      (c.purchasedFrom?.toLowerCase() || "").includes(q) ||
      (c.cementCompany?.toLowerCase() || "").includes(q)
    );
  }, [pendingCementLoads, cementLoads, searchQuery]);

  // ONE setState call — clears the form instantly.
  const clearForm = () => setForm(CEMENT_FORM_EMPTY);

  const handleSave = (e: React.FormEvent) => {
    const t0 = performance.now();
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    const payload = {
      purchasedFrom: form.purchasedFrom,
      cementCompany: form.cementCompany,
      loadInTonne: Number(form.loadInTonne),
      loadInBags: Number(form.loadInBags),
      amountPerLoad: Number(form.amountPerLoad),
      paidAmount: Number(form.paidAmount),
      purchaseDate: form.purchaseDate,
      buyerName: form.buyerName,
      invoiceNumber: form.invoiceNumber,
      remarks: form.remarks,
      currentStockDate: form.currentStockDate,
      currentStockQty: Number(form.currentStockQty),
      currentStockUsed: Number(form.currentStockUsed),
      currentStockBalance: Number(form.currentStockQty - form.currentStockUsed),
      currentStockUsedAmount: Number(form.currentStockUsedAmount),
      currentStockBalanceAmount: Number(form.currentStockBalanceAmount),
      paymentPartyName: form.paymentPartyName,
      paymentBillAmount: Number(form.paymentBillAmount),
      paymentBillDate: form.paymentBillDate,
      paymentPaidAmount: Number(form.paymentPaidAmount),
      paymentBalanceAmount: Number(form.paymentBillAmount - form.paymentPaidAmount),
      paymentRemarks: form.paymentRemarks,
    };

    // ── OPTIMISTIC UPDATE (synchronous, before any await) ──────────────────
    // For CREATE: add a temporary row immediately.
    // For UPDATE: update the existing row immediately via onOptimisticUpdate.
    // Neither path waits for the network.
    let optimisticId: string | null = null;

    if (!editingId) {
      optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Cast through unknown: payload.purchaseDate is a string (from the form)
      // but CementLoad.purchaseDate is Date. The table only reads it via formatDate()
      // which handles strings, so this is safe for the optimistic display.
      const optimisticLoad = {
        ...payload,
        id: optimisticId,
        // Derive fields that the server computes but the table needs immediately.
        balanceAmount: Number(payload.amountPerLoad) - Number(payload.paidAmount),
        createdAt: new Date(),
        ownerEmail: "",   // not used in the table display
        workId: null,
      } as unknown as CementLoad;
      setPendingCementLoads(prev => [optimisticLoad, ...prev]);
    } else {
      onOptimisticUpdate?.({ ...payload, id: editingId } as unknown as CementLoad);
    }

    const editId = editingId;
    const capturedOptimisticId = optimisticId;

    // Close the form and reset UI state immediately — all in one synchronous batch.
    clearForm();
    setEditingId(null);
    setShowForm(false);
    setIsSaving(false);

    console.log(`[PERF] UI closed in ${(performance.now() - t0).toFixed(1)}ms`);

    // ── BACKGROUND SERVER REQUEST ──────────────────────────────────────────
    // void (no await) — the browser has already painted the optimistic row.
    // We do NOT call onRefresh() on success; the server returns the saved
    // record directly which we use to reconcile the temp row.
    void (async () => {
      const t5 = performance.now();
      try {
        if (editId) {
          // UPDATE path: server returns the saved record; replace the
          // optimistically-updated row in the parent with the real data.
          const saved = await onUpdateCementLoad(editId, payload);
          console.log(`[PERF] Server update: ${(performance.now() - t5).toFixed(0)}ms`);
          if (saved) {
            onOptimisticUpdate?.(saved as unknown as CementLoad);
          }
        } else {
          // CREATE path: server returns the new record with the real DB ID.
          const saved = await onCreateCementLoad(payload);
          console.log(`[PERF] Server create: ${(performance.now() - t5).toFixed(0)}ms`);
          if (saved && capturedOptimisticId) {
            // Inject the real record into the parent's cementLoads array.
            // onOptimisticUpdate now handles inserts (ID not found → prepend).
            onOptimisticUpdate?.(saved as unknown as CementLoad);
            // Drop the temp row — the real record is now in cementLoads.
            setPendingCementLoads(prev =>
              prev.filter(item => item.id !== capturedOptimisticId)
            );
          } else if (capturedOptimisticId) {
            // Server returned nothing useful; fall back to refresh to get real data.
            setPendingCementLoads(prev =>
              prev.filter(item => item.id !== capturedOptimisticId)
            );
            await onRefresh();
          }
        }
      } catch (err) {
        console.error('Save failed:', err);
        // Roll back: remove the optimistic row on failure.
        if (capturedOptimisticId) {
          setPendingCementLoads(prev =>
            prev.filter(item => item.id !== capturedOptimisticId)
          );
        }
        alert('Failed to save cement load. Please try again.');
        // Refresh to ensure displayed data matches the server.
        await onRefresh();
      }
    })();
  };

  const handleEdit = (item: CementLoad) => {
    setForm({
      purchasedFrom: item.purchasedFrom,
      cementCompany: item.cementCompany,
      loadInTonne: item.loadInTonne,
      loadInBags: item.loadInBags,
      amountPerLoad: item.amountPerLoad,
      paidAmount: item.paidAmount,
      purchaseDate: formatDate(item.purchaseDate),
      buyerName: item.buyerName,
      invoiceNumber: item.invoiceNumber,
      remarks: item.remarks ?? "",
      currentStockDate: formatDate(item.currentStockDate),
      currentStockQty: item.currentStockQty ?? 0,
      currentStockUsed: item.currentStockUsed ?? 0,
      currentStockUsedAmount: item.currentStockUsedAmount ?? 0,
      currentStockBalanceAmount: item.currentStockBalanceAmount ?? 0,
      paymentPartyName: item.paymentPartyName ?? "",
      paymentBillAmount: item.paymentBillAmount ?? 0,
      paymentBillDate: formatDate(item.paymentBillDate),
      paymentPaidAmount: item.paymentPaidAmount ?? 0,
      paymentRemarks: item.paymentRemarks ?? "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this cement load?")) {
      setPendingCementLoads(prev => prev.filter(c => c.id !== id));
      try {
        await onDeleteCementLoad(id);
        onRefresh();
      } catch (err) {
        console.error('Delete failed:', err);
        onRefresh();
      }
    }
  };

  const totalBags = displayedCementLoads.reduce((sum, item) => sum + item.loadInBags, 0);
  const totalTonne = displayedCementLoads.reduce((sum, item) => sum + item.loadInTonne, 0);
  const totalAmount = displayedCementLoads.reduce((sum, item) => sum + item.amountPerLoad, 0);
  const totalPaid = displayedCementLoads.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalBalance = totalAmount - totalPaid;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-black">Cement Load Updation</h2>
          <p className="text-xs text-neutral-500">Record purchases, update stock levels, and track remaining balances.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => exportCSV(cementLoads, "cement_loads")}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Export Excel
          </button>
          <button 
            onClick={() => window.print()}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Print
          </button>
          {!showForm && (
            <button 
              onClick={() => { clearForm(); setEditingId(null); setShowForm(true); }}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-semibold rounded cursor-pointer"
            >
              Add Cement Load
            </button>
          )}
          <button 
            onClick={() => onNavigate("dashboard")}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>

      {/* Stats Summary Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total Bags Purchased</div>
          <div className="text-xl font-mono font-bold mt-1 text-black">{totalBags} Bags</div>
        </div>
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total Weight</div>
          <div className="text-xl font-mono font-bold mt-1 text-black">{totalTonne} Tonnes</div>
        </div>
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total Cost</div>
          <div className="text-xl font-mono font-bold mt-1 text-black">₹{totalAmount.toLocaleString()}</div>
        </div>
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total Balance Due</div>
          <div className="text-xl font-mono font-bold mt-1 text-black">₹{totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="border border-neutral-300 bg-white p-5 rounded space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-2">
            {editingId ? "Update Cement Load" : "New Cement Load Details"}
          </h3>
          
          {/* Main Load Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Purchased From</label>
              <input 
                type="text" required value={form.purchasedFrom} onChange={(e) => setField("purchasedFrom", e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Vendor Name"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Cement Company</label>
              <input 
                type="text" required value={form.cementCompany} onChange={(e) => setField("cementCompany", e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="e.g. UltraTech, ACC"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Purchased Date</label>
              <input 
                type="date" required value={form.purchaseDate} onChange={(e) => setField("purchaseDate", e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Load In Tonne</label>
              <input 
                type="number" step="any" required value={form.loadInTonne === 0 ? "" : form.loadInTonne} onChange={(e) => setField("loadInTonne", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Load In No. Of Pack</label>
              <input 
                type="number" required value={form.loadInBags === 0 ? "" : form.loadInBags} onChange={(e) => setField("loadInBags", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Billing Name/Buyer</label>
              <input 
                type="text" required value={form.buyerName} onChange={(e) => setField("buyerName", e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Buyer Name"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Invoice Number</label>
              <input 
                type="text" required value={form.invoiceNumber} onChange={(e) => setField("invoiceNumber", e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Invoice Number"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Amount Per Load</label>
              <input 
                type="number" required value={form.amountPerLoad === 0 ? "" : form.amountPerLoad} onChange={(e) => setField("amountPerLoad", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Paid Amount</label>
              <input 
                type="number" required value={form.paidAmount === 0 ? "" : form.paidAmount} onChange={(e) => setField("paidAmount", e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Balance To Be Paid</label>
              <div className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded text-xs font-mono font-bold text-black">
                ₹{(form.amountPerLoad - form.paidAmount).toLocaleString()}
              </div>
            </div>
            <div className="col-span-1 md:col-span-3">
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Remarks</label>
              <textarea 
                rows={2} value={form.remarks} onChange={(e) => setField("remarks", e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Additional notes"
              />
            </div>
          </div>

          {/* Current Stock Available Section */}
          <div className="border-t border-neutral-200 pt-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-black">Current Stock Available</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Current Date</label>
                <input 
                  type="date" value={form.currentStockDate} onChange={(e) => setField("currentStockDate", e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Stock</label>
                <input 
                  type="number" value={form.currentStockQty === 0 ? "" : form.currentStockQty} onChange={(e) => setField("currentStockQty", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Used</label>
                <input 
                  type="number" value={form.currentStockUsed === 0 ? "" : form.currentStockUsed} onChange={(e) => setField("currentStockUsed", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Balance</label>
                <div className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded text-xs font-mono font-bold text-black">
                  {(form.currentStockQty - form.currentStockUsed).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">U Amount</label>
                <input 
                  type="number" value={form.currentStockUsedAmount === 0 ? "" : form.currentStockUsedAmount} onChange={(e) => setField("currentStockUsedAmount", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Bal Amount</label>
                <input 
                  type="number" value={form.currentStockBalanceAmount === 0 ? "" : form.currentStockBalanceAmount} onChange={(e) => setField("currentStockBalanceAmount", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                />
              </div>
            </div>
          </div>

          {/* Payment Details Section */}
          <div className="border-t border-neutral-200 pt-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-black">Payment Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Party Name</label>
                <input 
                  type="text" value={form.paymentPartyName} onChange={(e) => setField("paymentPartyName", e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                  placeholder="Party Name"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Bill Amount</label>
                <input 
                  type="number" value={form.paymentBillAmount === 0 ? "" : form.paymentBillAmount} onChange={(e) => setField("paymentBillAmount", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Bill Date</label>
                <input 
                  type="date" value={form.paymentBillDate} onChange={(e) => setField("paymentBillDate", e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Paid Amount</label>
                <input 
                  type="number" value={form.paymentPaidAmount === 0 ? "" : form.paymentPaidAmount} onChange={(e) => setField("paymentPaidAmount", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Balance Amount</label>
                <div className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded text-xs font-mono font-bold text-black">
                  ₹{(form.paymentBillAmount - form.paymentPaidAmount).toLocaleString()}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Remarks</label>
                <input 
                  type="text" value={form.paymentRemarks} onChange={(e) => setField("paymentRemarks", e.target.value)}
                  className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                  placeholder="Payment remarks"
                />
              </div>
            </div>
          </div>

          {/* Action buttons on every page: Edit, Save, Clear, Update, Cancel, Back */}
          <div className="flex gap-2 justify-end border-t border-neutral-200 pt-3">
            {editingId && (
              <button 
                type="button" onClick={() => { const item = displayedCementLoads.find(c => c.id === editingId); if (item) handleEdit(item); }}
                className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
              >
                Edit
              </button>
            )}
            <button 
              type="submit"
              disabled={isSaving}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-semibold rounded cursor-pointer disabled:opacity-50"
            >
              {isSaving ? "Saving..." : editingId ? "Update" : "Save"}
            </button>
            <button 
              type="button" onClick={clearForm}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Clear
            </button>
            <button 
              type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Main Table view */}
      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input 
              type="text" placeholder="Search party or brand..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Desktop Table View */}
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                <th className="p-3">Date</th>
                <th className="p-3">Party (Purchased From)</th>
                <th className="p-3">Company</th>
                <th className="p-3 text-right">Load (T)</th>
                <th className="p-3 text-right">Packs (Bags)</th>
                <th className="p-3 text-right">Total Amt</th>
                <th className="p-3 text-right">Paid Amt</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {displayedCementLoads.map(load => (
                <tr key={load.id} className="hover:bg-neutral-50">
                  <td className="p-3 font-mono text-black">{formatDate(load.purchaseDate)}</td>
                  <td className="p-3 font-bold text-black">{load.purchasedFrom}</td>
                  <td className="p-3 text-black">{load.cementCompany}</td>
                  <td className="p-3 text-right font-mono text-black">{load.loadInTonne} T</td>
                  <td className="p-3 text-right font-mono text-black">{load.loadInBags}</td>
                  <td className="p-3 text-right font-mono text-black">₹{load.amountPerLoad.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-neutral-600">₹{load.paidAmount.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold text-black">₹{(load.balanceAmount ?? (load.amountPerLoad - load.paidAmount)).toLocaleString()}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(load)} className="px-2 py-1 border border-neutral-300 rounded text-[10px] font-bold text-black hover:bg-neutral-100 cursor-pointer">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(load.id)} className="px-2 py-1 border border-neutral-300 rounded text-[10px] font-bold text-black hover:bg-neutral-100 cursor-pointer">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayedCementLoads.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-neutral-400">No cement load records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MODULE 2 – ENTRY
// ==========================================
export function EntryView({
  entries,
  onRefresh,
  onCreateEntry,
  onUpdateEntry,
  onDeleteEntry,
  onNavigate
}: {
  entries: Entry[];
  onRefresh: () => void;
  onCreateEntry: (data: any) => Promise<any>;
  onUpdateEntry: (id: string, data: any) => Promise<any>;
  onDeleteEntry: (id: string) => Promise<any>;
  onNavigate: (tab: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  // Form states
  const [workName, setWorkName] = useState("");
  const [amount, setAmount] = useState(0);
  const [nameOfOffice, setNameOfOffice] = useState("");
  const [mlaMpName, setMlaMpName] = useState("");
  const [loaReceived, setLoaReceived] = useState(false);
  const [lastDateToExecuteAgreement, setLastDateToExecuteAgreement] = useState("");
  const [amountOfStampPaperRequired, setAmountOfStampPaperRequired] = useState(0);
  const [securityAmount, setSecurityAmount] = useState(0);
  const [performanceGuarantee, setPerformanceGuarantee] = useState(0);
  const [dlpPeriodAsPerInLOA, setDlpPeriodAsPerInLOA] = useState("");
  const [agreementNo, setAgreementNo] = useState("");
  const [siteHandoverDate, setSiteHandoverDate] = useState("");
  const [workCompletionDateAsPerAgreement, setWorkCompletionDateAsPerAgreement] = useState("");
  // Contact person state hooks
  const [wardMemberName, setWardMemberName] = useState("");
  const [wardMemberPhone, setWardMemberPhone] = useState("");
  const [overseerName, setOverseerName] = useState("");
  const [overseerPhone, setOverseerPhone] = useState("");
  const [executiveEngineerName, setExecutiveEngineerName] = useState("");
  const [executiveEngineerPhone, setExecutiveEngineerPhone] = useState("");
  const [assistantEngineerName, setAssistantEngineerName] = useState("");
  const [assistantEngineerPhone, setAssistantEngineerPhone] = useState("");
  const [blockEngineerName, setBlockEngineerName] = useState("");
  const [blockEngineerPhone, setBlockEngineerPhone] = useState("");
  const [gstApplicable, setGstApplicable] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const clearForm = () => {
    setWardMemberName("");
    setWardMemberPhone("");
    setOverseerName("");
    setOverseerPhone("");
    setExecutiveEngineerName("");
    setExecutiveEngineerPhone("");
    setAssistantEngineerName("");
    setAssistantEngineerPhone("");
    setBlockEngineerName("");
    setBlockEngineerPhone("");
    setAmount(0);
    setNameOfOffice("");
    setMlaMpName("");
    setLoaReceived(false);
    setGstApplicable(false);
    setLastDateToExecuteAgreement("");
    setAmountOfStampPaperRequired(0);
    setSecurityAmount(0);
    setPerformanceGuarantee(0);
    setDlpPeriodAsPerInLOA("");
    setAgreementNo("");
    setSiteHandoverDate("");
    setWorkCompletionDateAsPerAgreement("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        workName,
        amount: Number(amount),
        nameOfOffice,
        mlaMpName: mlaMpName || "",
        loaReceived,
        gstApplicable,
        lastDateToExecuteAgreement,
        amountOfStampPaperRequired: Number(amountOfStampPaperRequired),
        securityAmount: Number(securityAmount),
        performanceGuarantee: Number(performanceGuarantee),
        dlpPeriodAsPerInLOA,
        agreementNo,
        siteHandoverDate,
        workCompletionDateAsPerAgreement,
        // Contact fields
        wardMemberName: wardMemberName || "",
        wardMemberPhone: wardMemberPhone || "",
        overseerName: overseerName || "",
        overseerPhone: overseerPhone || "",
        executiveEngineerName: executiveEngineerName || "",
        executiveEngineerPhone: executiveEngineerPhone || "",
        assistantEngineerName: assistantEngineerName || "",
        assistantEngineerPhone: assistantEngineerPhone || "",
        blockEngineerName: blockEngineerName || "",
        blockEngineerPhone: blockEngineerPhone || "",
        status: 'Not Started',
        paymentReceived: 0,
        createdAt: new Date().toISOString()
      };
      if (editingId) {
        await onUpdateEntry(editingId, payload);
      } else {
        await onCreateEntry(payload);
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setWorkName(entry.workName);
    setAmount(entry.amount);
    setNameOfOffice(entry.nameOfOffice);
    setMlaMpName(entry.mlaMpName || "");
    setLoaReceived(entry.loaReceived);
    setGstApplicable(entry.gstApplicable || false);
    setLastDateToExecuteAgreement(formatDate(entry.lastDateToExecuteAgreement));
    setAmountOfStampPaperRequired(entry.amountOfStampPaperRequired);
    setSecurityAmount(entry.securityAmount);
    setPerformanceGuarantee(entry.performanceGuarantee);
    setDlpPeriodAsPerInLOA(entry.dlpPeriodAsPerInLOA);
    setAgreementNo(entry.agreementNo);
    setSiteHandoverDate(formatDate(entry.siteHandoverDate));
    setWorkCompletionDateAsPerAgreement(formatDate(entry.workCompletionDateAsPerAgreement));
    setWardMemberName(entry.wardMemberName || "");
    setWardMemberPhone(entry.wardMemberPhone || "");
    setOverseerName(entry.overseerName || "");
    setOverseerPhone(entry.overseerPhone || "");
    setExecutiveEngineerName(entry.executiveEngineerName || "");
    setExecutiveEngineerPhone(entry.executiveEngineerPhone || "");
    setAssistantEngineerName(entry.assistantEngineerName || "");
    setAssistantEngineerPhone(entry.assistantEngineerPhone || "");
    setBlockEngineerName(entry.blockEngineerName || "");
    setBlockEngineerPhone(entry.blockEngineerPhone || "");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this project entry?")) {
      await onDeleteEntry(id);
      onRefresh();
    }
  };

  const filteredEntries = entries.filter(e => 
    e.workName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.agreementNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.nameOfOffice.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-black">Entry</h2>
          <p className="text-xs text-neutral-500">Record work details, agreements, SLA specifications, and handover timelines.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => exportCSV(entries, "work_entries")}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Export Excel
          </button>
          <button 
            onClick={() => window.print()}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Print
          </button>
          {!showForm && (
            <button 
              onClick={() => { clearForm(); setEditingId(null); setShowForm(true); }}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-semibold rounded cursor-pointer"
            >
              Add Entry
            </button>
          )}
          <button 
            onClick={() => onNavigate("dashboard")}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="border border-neutral-300 bg-white p-5 rounded space-y-4">
          <h3 className="text-xs font-bold uppercase border-b border-neutral-200 pb-2 text-black">
            {editingId ? "Update Entry details" : "New Contract / Project Entry"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Work Name</label>
              <input 
                type="text" required value={workName} onChange={(e) => setWorkName(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Full title of the project"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Amount (Without GST)</label>
              <input 
                type="number" required value={amount === 0 ? "" : amount} onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Name Of Office</label>
              <input 
                type="text" required value={nameOfOffice} onChange={(e) => setNameOfOffice(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="e.g. NHAI Regional Office, PWD"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">MLA/MP Name (Optional)</label>
              <input 
                type="text" value={mlaMpName} onChange={(e) => setMlaMpName(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Constituency details"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">LOA Received</label>
              <select 
                value={loaReceived ? "true" : "false"} onChange={(e) => setLoaReceived(e.target.value === "true")}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              >
                <option value="false">No / Pending</option>
                <option value="true">Yes / Received</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">GST Applicable (18%)</label>
              <select 
                value={gstApplicable ? "true" : "false"} onChange={(e) => setGstApplicable(e.target.value === "true")}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              >
                <option value="false">No / Exempt</option>
                <option value="true">Yes / Applicable</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Last Date To Execute Agreement</label>
              <input 
                type="date" required value={lastDateToExecuteAgreement} onChange={(e) => setLastDateToExecuteAgreement(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Amount Of Stamp Paper Required</label>
              <input 
                type="number" required value={amountOfStampPaperRequired === 0 ? "" : amountOfStampPaperRequired} onChange={(e) => setAmountOfStampPaperRequired(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Security Amount</label>
              <input 
                type="number" required value={securityAmount === 0 ? "" : securityAmount} onChange={(e) => setSecurityAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Performance Guarantee (If Applicable)</label>
              <input 
                type="number" value={performanceGuarantee === 0 ? "" : performanceGuarantee} onChange={(e) => setPerformanceGuarantee(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">DLP Period As Per In LOA</label>
              <input 
                type="text" required value={dlpPeriodAsPerInLOA} onChange={(e) => setDlpPeriodAsPerInLOA(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="e.g. 24 Months, 3 Years"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Agreement No</label>
              <input 
                type="text" required value={agreementNo} onChange={(e) => setAgreementNo(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
                placeholder="AGR-..."
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Ward Member Name</label>
              <input type="text" value={wardMemberName} onChange={e => setWardMemberName(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Ward Member" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Ward Member Phone</label>
              <input type="text" value={wardMemberPhone} onChange={e => setWardMemberPhone(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Overseer Name</label>
              <input type="text" value={overseerName} onChange={e => setOverseerName(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Overseer" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Overseer Phone</label>
              <input type="text" value={overseerPhone} onChange={e => setOverseerPhone(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Executive Engineer Name</label>
              <input type="text" value={executiveEngineerName} onChange={e => setExecutiveEngineerName(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Executive Engineer" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Executive Engineer Phone</label>
              <input type="text" value={executiveEngineerPhone} onChange={e => setExecutiveEngineerPhone(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Assistant Engineer Name</label>
              <input type="text" value={assistantEngineerName} onChange={e => setAssistantEngineerName(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Assistant Engineer" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Assistant Engineer Phone</label>
              <input type="text" value={assistantEngineerPhone} onChange={e => setAssistantEngineerPhone(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Block Engineer Name</label>
              <input type="text" value={blockEngineerName} onChange={e => setBlockEngineerName(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Block Engineer" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Block Engineer Phone</label>
              <input type="text" value={blockEngineerPhone} onChange={e => setBlockEngineerPhone(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Site Handover Date</label>
              <input 
                type="date" required value={siteHandoverDate} onChange={(e) => setSiteHandoverDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Work Completion Date As Per Agreement</label>
              <input 
                type="date" required value={workCompletionDateAsPerAgreement} onChange={(e) => setWorkCompletionDateAsPerAgreement(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t border-neutral-200 pt-3">
            {editingId && (
              <button 
                type="button" onClick={() => handleEdit(entries.find(e => e.id === editingId)!)}
                className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
              >
                Edit
              </button>
            )}
            {!editingId ? (
              <button 
                type="submit"
                disabled={isSaving}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            ) : (
              <button 
                type="submit"
                disabled={isSaving}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Update"}
              </button>
            )}
            <button 
              type="button" onClick={clearForm}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Clear
            </button>
            <button 
              type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Back
            </button>
          </div>
        </form>
      )}

      {/* Main Table view */}
      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input 
              type="text" placeholder="Search work title or agreement..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* Desktop Table View */}
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                <th className="p-3">Work Name</th>
                <th className="p-3">Office</th>
                <th className="p-3 text-right">Amount (Without GST)</th>
                <th className="p-3">Agreement No.</th>
                <th className="p-3">Handover</th>
                <th className="p-3">Completion Date</th>
                <th className="p-3 text-center">LOA</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredEntries.map(e => (
                <tr key={e.id} className="hover:bg-neutral-55">
                  <td className="p-3">
                    <button 
                      onClick={() => setSelectedEntry(e)}
                      className="font-bold text-black hover:underline text-left cursor-pointer focus:outline-none bg-transparent border-none p-0"
                    >
                      {e.workName}
                    </button>
                  </td>
                  <td className="p-3 text-neutral-600">{e.nameOfOffice}</td>
                  <td className="p-3 text-right font-mono font-bold text-black">₹{e.amount.toLocaleString()}</td>
                  <td className="p-3 font-mono text-black">{e.agreementNo || "Pending"}</td>
                  <td className="p-3 font-mono text-black">{formatDate(e.siteHandoverDate)}</td>
                  <td className="p-3 font-mono text-black">{formatDate(e.workCompletionDateAsPerAgreement)}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${e.loaReceived ? 'border-black bg-black text-white' : 'border-neutral-300 bg-white text-neutral-500'}`}>
                      {e.loaReceived ? "YES" : "NO"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(e)} className="px-2 py-1 border border-neutral-300 rounded text-[10px] font-bold text-black hover:bg-neutral-100 cursor-pointer">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="px-2 py-1 border border-neutral-300 rounded text-[10px] font-bold text-black hover:bg-neutral-100 cursor-pointer">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-neutral-400">No project entries logged.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
          <div className="bg-white border border-neutral-300 w-full max-w-3xl rounded shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Project details</span>
                <h3 className="text-sm font-bold text-black uppercase mt-0.5">{selectedEntry.workName}</h3>
              </div>
              <button 
                onClick={() => setSelectedEntry(null)} 
                className="p-1 hover:bg-neutral-200 rounded text-neutral-500 hover:text-black cursor-pointer bg-transparent border-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-neutral-700 text-left">
              {/* Project General details */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-3">Project Overview</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Amount (Without GST)</span>
                    <span className="font-mono font-bold text-black text-sm">₹{selectedEntry.amount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">GST Applicable</span>
                    <span className="font-semibold text-black">{selectedEntry.gstApplicable ? "Yes (18%)" : "No / Exempt"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Total Amount (Inc. GST)</span>
                    <span className="font-mono font-bold text-black text-sm">
                      ₹{(selectedEntry.amount * (selectedEntry.gstApplicable ? 1.18 : 1)).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Office / Authority</span>
                    <span className="font-semibold text-black">{selectedEntry.nameOfOffice}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">MLA/MP Name</span>
                    <span className="font-semibold text-black">{selectedEntry.mlaMpName || "N/A"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">LOA Status</span>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border mt-0.5 ${selectedEntry.loaReceived ? 'border-black bg-black text-white' : 'border-neutral-300 bg-white text-neutral-500'}`}>
                      {selectedEntry.loaReceived ? "RECEIVED" : "PENDING"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Agreement & Financial Securities */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-3">Agreement & Security Details</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Agreement No</span>
                    <span className="font-mono font-semibold text-black">{selectedEntry.agreementNo || "Pending"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Stamp Paper Value</span>
                    <span className="font-mono font-semibold text-black">₹{selectedEntry.amountOfStampPaperRequired.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Security Deposit</span>
                    <span className="font-mono font-semibold text-black">₹{selectedEntry.securityAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Performance Guarantee</span>
                    <span className="font-mono font-semibold text-black">₹{selectedEntry.performanceGuarantee.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">DLP Period</span>
                    <span className="font-semibold text-black">{selectedEntry.dlpPeriodAsPerInLOA || "N/A"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Current Status</span>
                    <span className="font-semibold text-black">{selectedEntry.status || "Not Started"}</span>
                  </div>
                </div>
              </div>

              {/* Timelines */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-3">Execution Timelines</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-4 gap-x-6">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Last Date to Execute Agreement</span>
                    <span className="font-mono font-semibold text-black">{formatDate(selectedEntry.lastDateToExecuteAgreement)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Site Handover Date</span>
                    <span className="font-mono font-semibold text-black">{formatDate(selectedEntry.siteHandoverDate)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Contract Completion Date</span>
                    <span className="font-mono font-semibold text-black">{formatDate(selectedEntry.workCompletionDateAsPerAgreement)}</span>
                  </div>
                </div>
              </div>

              {/* Contact directory */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-3">Department Contacts</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border border-neutral-100 p-2.5 rounded bg-neutral-50">
                    <div className="font-semibold text-black text-[10px] uppercase mb-1">Ward Member</div>
                    <div>Name: <span className="font-semibold text-black">{selectedEntry.wardMemberName || "N/A"}</span></div>
                    <div>Phone: <span className="font-semibold text-black">{selectedEntry.wardMemberPhone || "N/A"}</span></div>
                  </div>
                  <div className="border border-neutral-100 p-2.5 rounded bg-neutral-50">
                    <div className="font-semibold text-black text-[10px] uppercase mb-1">Overseer</div>
                    <div>Name: <span className="font-semibold text-black">{selectedEntry.overseerName || "N/A"}</span></div>
                    <div>Phone: <span className="font-semibold text-black">{selectedEntry.overseerPhone || "N/A"}</span></div>
                  </div>
                  <div className="border border-neutral-100 p-2.5 rounded bg-neutral-50">
                    <div className="font-semibold text-black text-[10px] uppercase mb-1">Executive Engineer (EE)</div>
                    <div>Name: <span className="font-semibold text-black">{selectedEntry.executiveEngineerName || "N/A"}</span></div>
                    <div>Phone: <span className="font-semibold text-black">{selectedEntry.executiveEngineerPhone || "N/A"}</span></div>
                  </div>
                  <div className="border border-neutral-100 p-2.5 rounded bg-neutral-50">
                    <div className="font-semibold text-black text-[10px] uppercase mb-1">Assistant Engineer (AE)</div>
                    <div>Name: <span className="font-semibold text-black">{selectedEntry.assistantEngineerName || "N/A"}</span></div>
                    <div>Phone: <span className="font-semibold text-black">{selectedEntry.assistantEngineerPhone || "N/A"}</span></div>
                  </div>
                  <div className="border border-neutral-100 p-2.5 rounded bg-neutral-50 sm:col-span-2">
                    <div className="font-semibold text-black text-[10px] uppercase mb-1">Block Engineer</div>
                    <div>Name: <span className="font-semibold text-black">{selectedEntry.blockEngineerName || "N/A"}</span></div>
                    <div>Phone: <span className="font-semibold text-black">{selectedEntry.blockEngineerPhone || "N/A"}</span></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
              <button 
                onClick={() => { handleEdit(selectedEntry); setSelectedEntry(null); }}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-semibold rounded cursor-pointer"
              >
                Edit Details
              </button>
              <button 
                onClick={() => setSelectedEntry(null)}
                className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// MODULE 3 – STOCK REGISTER
// ==========================================
export function StockRegisterView({
  stockItems,
  onRefresh,
  onUpdateStockItem,
  onNavigate
}: {
  stockItems: StockRegisterItem[];
  onRefresh: () => void;
  onUpdateStockItem: (id: string, data: any) => Promise<any>;
  onNavigate: (tab: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [inBarrel, setInBarrel] = useState(0);
  const [inKg, setInKg] = useState(0);
  const [inTonne, setInTonne] = useState(0);
  const [usedInTonne, setUsedInTonne] = useState(0);
  const [materialName, setMaterialName] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const handleEdit = (item: StockRegisterItem) => {
    setEditingId(item.id);
    setMaterialName(item.materialName);
    setInBarrel(item.inBarrel);
    setInKg(item.inKg);
    setInTonne(item.inTonne);
    setUsedInTonne(item.usedInTonne);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || isSaving) return;
    setIsSaving(true);
    try {
      await onUpdateStockItem(editingId, {
        inBarrel: Number(inBarrel),
        inKg: Number(inKg),
        inTonne: Number(inTonne),
        usedInTonne: Number(usedInTonne)
      });
      setEditingId(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const clearForm = () => {
    setInBarrel(0);
    setInKg(0);
    setInTonne(0);
    setUsedInTonne(0);
  };

  const filteredItems = stockItems.filter(item => 
    item.materialName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-black">Stock Register</h2>
          <p className="text-xs text-neutral-500">Real-time inventory levels of raw building material aggregates.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => exportCSV(stockItems, "stock_register")}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Export Excel
          </button>
          <button 
            onClick={() => window.print()}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Print
          </button>
          <button 
            onClick={() => onNavigate("dashboard")}
            className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>

      {/* Stats Summary Cards for Stock Balances (Main Attraction) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
        {stockItems.map(item => {
          const balance = item.inTonne - item.usedInTonne;
          let borderColor = "#a3a3a3";
          if (item.materialName === "Cement") borderColor = "#2563eb";
          else if (item.materialName === "RS1") borderColor = "#f59e0b";
          else if (item.materialName === "SS1") borderColor = "#10b981";
          else if (item.materialName === "VG30") borderColor = "#4f46e5";
          
          return (
            <div key={item.id} style={{ borderLeftColor: borderColor }} className="border border-neutral-200 border-l-4 bg-white p-4 rounded shadow-sm hover:shadow-md transition-all duration-200">
              <div className="text-[10px] uppercase font-bold text-neutral-400">{item.materialName} Balance</div>
              <div className="text-2xl font-mono font-bold mt-1 text-black">
                {balance.toFixed(3)} T
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {item.usedInTonne.toFixed(3)} T used of {item.inTonne.toFixed(3)} T
              </div>
            </div>
          );
        })}
      </div>

      {editingId && (
        <form onSubmit={handleSave} className="border border-neutral-300 bg-white p-5 rounded space-y-4">
          <h3 className="text-xs font-bold uppercase border-b border-neutral-200 pb-2 text-black">
            Update Stock levels for {materialName}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">In Barrel</label>
              <input 
                type="number" required value={inBarrel === 0 ? "" : inBarrel} onChange={(e) => setInBarrel(e.target.value === "" ? 0 : Number(e.target.value))}
                disabled={materialName === "Cement"}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white disabled:bg-neutral-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">In KG</label>
              <input 
                type="number" required value={inKg === 0 ? "" : inKg} onChange={(e) => setInKg(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">In Tonne</label>
              <input 
                type="number" required value={inTonne === 0 ? "" : inTonne} onChange={(e) => setInTonne(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Used In Tonne</label>
              <input 
                type="number" required value={usedInTonne === 0 ? "" : usedInTonne} onChange={(e) => setUsedInTonne(e.target.value === "" ? 0 : Number(e.target.value))}
                disabled={materialName === "Cement"}
                className="w-full px-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black font-mono text-black bg-white disabled:bg-neutral-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t border-neutral-200 pt-3">
            <button 
              type="button" onClick={() => handleEdit(stockItems.find(s => s.id === editingId)!)}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Edit
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Update"}
            </button>
            <button 
              type="button" onClick={clearForm}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Clear
            </button>
            <button 
              type="button" onClick={() => setEditingId(null)}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="button" onClick={() => setEditingId(null)}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
            >
              Back
            </button>
          </div>
        </form>
      )}

      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input 
              type="text" placeholder="Search material..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                <th className="p-3.5">Material Name</th>
                <th className="p-3.5 text-right">In Barrel</th>
                <th className="p-3.5 text-right">In KG</th>
                <th className="p-3.5 text-right">In Tonne</th>
                <th className="p-3.5 text-right">Used In Tonne</th>
                <th className="p-3.5 text-right">Balance In Tonne</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-neutral-55">
                  <td className="p-3.5 font-bold text-black">{item.materialName}</td>
                  <td className="p-3.5 text-right font-mono text-black">{item.inBarrel.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono text-black">{item.inKg.toFixed(3)} KG</td>
                  <td className="p-3.5 text-right font-mono text-black">{item.inTonne.toFixed(3)} T</td>
                  <td className="p-3.5 text-right font-mono text-neutral-500">{item.usedInTonne.toFixed(3)} T</td>
                  <td className="p-3.5 text-right font-mono font-bold text-black border-l border-neutral-50 bg-neutral-50">
                    {(item.inTonne - item.usedInTonne).toFixed(3)} T
                  </td>
                  <td className="p-3.5 text-right">
                    <button onClick={() => handleEdit(item)} className="px-2 py-1 border border-neutral-300 rounded text-[10px] font-bold text-black hover:bg-neutral-100 cursor-pointer">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// MODULE 4 – TOTAL MATERIALS USED IN SITE
// ==========================================
export function MaterialsUsedView({
  entries,
  siteMaterials,
  privateWorks = [],
  onRefresh,
  onCreateSiteMaterial,
  onUpdateSiteMaterial,
  onDeleteSiteMaterial,
  onNavigate
}: {
  entries: Entry[];
  privateWorks?: PrivateWork[];
  siteMaterials: SiteMaterial[];
  onRefresh: () => void;
  onCreateSiteMaterial: (data: any) => Promise<any>;
  onUpdateSiteMaterial: (id: string, data: any) => Promise<any>;
  onDeleteSiteMaterial: (id: string) => Promise<any>;
  onNavigate: (tab: string) => void;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemType, setItemType] = useState<'to_deliver' | 'delivered'>('to_deliver');
  const [workSearchQuery, setWorkSearchQuery] = useState("");

  const handleWorkSearch = (query: string) => {
    setWorkSearchQuery(query);
    if (!query) {
      setSelectedEntryId("");
      return;
    }
    const combined = [
      ...entries.map(e => ({ id: e.id, name: e.workName })),
      ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName }))
    ];
    const match = combined.find(opt => 
      opt.name.toLowerCase().includes(query.toLowerCase())
    );
    if (match) {
      setSelectedEntryId(match.id);
    } else {
      setSelectedEntryId("");
    }
  };

  // Form inputs
  const [itemSlNo, setItemSlNo] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [estimatedQuantity, setEstimatedQuantity] = useState(0);
  const [deliveredQuantity, setDeliveredQuantity] = useState(0);
  const [specName, setSpecName] = useState("");
  const [unit, setUnit] = useState("cft");
  const [qtyInCum, setQtyInCum] = useState<number | "">("");

  const selectedEntry = entries.find(e => e.id === selectedEntryId);
  const selectedPrivate = privateWorks?.find(p => p.id === selectedEntryId);
  const work = selectedEntry || selectedPrivate;

  const clearForm = () => {
    setItemSlNo("");
    setSpecName("");
    setEstimatedQuantity(0);
    setDeliveredQuantity(0);
    setUnit("cft");
    setQtyInCum("");
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryId) return;
    await onCreateSiteMaterial({
      entryId: selectedEntryId,
      type: itemType,
      itemSlNo,
      specName,
      unit,
      estimatedQuantity: Number(estimatedQuantity),
      deliveredQuantityInCft: Number(deliveredQuantity)
    });
    clearForm();
    setShowItemForm(false);
    onRefresh();
  };

  const handleEditItem = (item: SiteMaterial, type: 'to_deliver' | 'delivered') => {
    setItemSlNo(item.itemSlNo);
    setSpecName(item.specName);
    setUnit(item.unit || "cft");
    if (type === 'to_deliver') {
      setEstimatedQuantity(item.estimatedQuantity);
      setDeliveredQuantity(0);
      setItemType('to_deliver');
    } else {
      setEstimatedQuantity(0);
      setDeliveredQuantity(item.deliveredQuantityInCft);
      setItemType('delivered');
    }
    setEditingItemId(item.id);
  };

  const handleSaveEdit = async (id: string) => {
    if (itemType === 'to_deliver') {
      await onUpdateSiteMaterial(id, { estimatedQuantity: Number(estimatedQuantity) });
    } else {
      await onUpdateSiteMaterial(id, { deliveredQuantityInCft: Number(deliveredQuantity) });
    }
    setEditingItemId(null);
    clearForm();
    onRefresh();
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    clearForm();
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm("Are you sure you want to delete this site material record?")) {
      await onDeleteSiteMaterial(id);
      onRefresh();
    }
  };

  const currentWorkMaterials = siteMaterials.filter(m => m.entryId === selectedEntryId);
  const toDeliverList = currentWorkMaterials.filter(m => m.type === 'to_deliver');
  const deliveredList = currentWorkMaterials.filter(m => m.type === 'delivered');
  const filteredToDeliver = toDeliverList;
  const filteredDelivered = deliveredList;

  // Calculate material balance summary
  const summaryMap: { [key: string]: { estimated: number; delivered: number } } = {};
  
  toDeliverList.forEach(item => {
    const name = item.specName;
    if (!summaryMap[name]) {
      summaryMap[name] = { estimated: 0, delivered: 0 };
    }
    summaryMap[name].estimated += item.estimatedQuantity;
  });
  
  deliveredList.forEach(item => {
    const name = item.specName;
    if (!summaryMap[name]) {
      summaryMap[name] = { estimated: 0, delivered: 0 };
    }
    summaryMap[name].delivered += item.deliveredQuantityInCft;
  });
  
  const materialSummary = Object.entries(summaryMap).map(([specName, data]) => ({
    specName,
    estimated: data.estimated,
    delivered: data.delivered,
    balance: data.estimated - data.delivered
  }));

  // Combine entries and private works for dropdown
  const filteredWorkOptions = [
    ...entries.map(e => ({ id: e.id, name: e.workName, type: 'entry' as const })),
    ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName, type: 'private' as const }))
  ].filter(opt => opt.name.toLowerCase().includes(workSearchQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Total Materials Used in Site</h2>
        <p className="text-xs text-neutral-500 font-medium">Select a contract work to log estimated deliverables and reconcile materials dispatched to the site.</p>
      </div>

      {/* Action Toolbar */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => exportCSV(siteMaterials, "materials_used")}
          className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
        >
          Export Excel
        </button>
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
        >
          Print
        </button>
        <button
          onClick={() => onNavigate("dashboard")}
          className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
        >
          Back
        </button>
      </div>
      {/* Search Input */}
      <div className="relative w-64 mb-4">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
        <input 
          type="text" placeholder="Search work name..." value={workSearchQuery} onChange={(e) => handleWorkSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
        />
      </div>

      {/* Select work name drop-down */}
      <div className="border border-neutral-200 bg-white p-4 rounded space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1.5">Select Work Name</label>
          <select 
            value={selectedEntryId} onChange={(e) => setSelectedEntryId(e.target.value)}
            className="w-full md:w-1/2 px-3 py-2 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold text-black bg-white"
          >
            <option value="">-- Choose Work --</option>
            {filteredWorkOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.name}{opt.type === 'private' ? " (Private)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {work && (
        <div className="space-y-6 animate-fade-in">
          {/* Work Metadata */}
          <div className="border border-neutral-200 bg-white p-4 rounded grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Work Name</span>
              <span className="font-bold">{work.workName}</span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Total Amount</span>
              <span className="font-mono font-bold">₹{((work as any).amount ?? (work as any).approxAmount ?? 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Handover Date</span>
              <span className="font-mono font-bold">{((work as any).siteHandoverDate ?? (work as any).siteVisitDate ?? "").substring(0, 10)}</span>
            </div>
            <div>
              <span className="text-neutral-400 block text-[9px] uppercase font-bold">Completion Date</span>
              <span className="font-mono font-bold">{((work as any).workCompletionDateAsPerAgreement ?? (work as any).completedDate ?? "").substring(0, 10)}</span>
            </div>
          </div>

          {/* Material Balance Summary (Main Attraction) */}
          <div className="border border-neutral-200 bg-white p-4 rounded space-y-3">
            <h3 className="font-bold text-xs uppercase text-neutral-800 border-b border-neutral-100 pb-2">Material Balance Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {materialSummary.map(m => {
                let borderColor = "#a3a3a3";
                if (m.balance > 0) borderColor = "#f59e0b"; // Orange/Amber
                else if (m.balance === 0) borderColor = "#10b981"; // Green
                else borderColor = "#ef4444"; // Red
                
                return (
                  <div key={m.specName} style={{ borderLeftColor: borderColor }} className="border border-neutral-200 border-l-4 bg-neutral-50/50 p-3 rounded shadow-xs hover:shadow-sm transition-all duration-150">
                    <div className="text-[10px] uppercase font-bold text-neutral-400">{m.specName} Balance</div>
                    <div className="text-xl font-mono font-bold mt-1 text-black">
                      {m.balance.toLocaleString()} CFT
                    </div>
                    <div className="text-[9px] text-neutral-500 mt-1">
                      Delivered {m.delivered.toLocaleString()} of {m.estimated.toLocaleString()} CFT
                    </div>
                  </div>
                );
              })}
              {materialSummary.length === 0 && (
                <div className="col-span-2 md:col-span-4 text-xs text-neutral-400 text-center py-2">
                  No materials estimated or delivered yet.
                </div>
              )}
            </div>
          </div>

          {showItemForm && (
            <form onSubmit={handleAddItem} className="border border-black bg-white p-4 rounded space-y-4">
              <h4 className="text-xs font-bold uppercase border-b border-neutral-100 pb-2">
                Add item to {itemType === 'to_deliver' ? "Estimate Quantity" : "Actual Quantity delivered in site"}
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Sl No (Auto)</label>
                  <input type="text" readOnly value={itemSlNo} className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs bg-neutral-50 text-neutral-500 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Spec/Item Name</label>
                  <select 
                    required 
                    value={specName} 
                    onChange={(e) => setSpecName(e.target.value)} 
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs text-black bg-white focus:outline-none focus:border-black"
                  >
                    <option value="">-- Choose Item --</option>
                    <option value="6mm">6mm</option>
                    <option value="12mm">12mm</option>
                    <option value="20mm">20mm</option>
                    <option value="40mm">40mm</option>
                    <option value="M Sand">M Sand</option>
                    <option value="Dust">Dust</option>
                    <option value="GSB">GSB</option>
                    <option value="WMM">WMM</option>
                    <option value="Cement">Cement</option>
                    <option value="VG 30">VG 30</option>
                    <option value="SS1">SS1</option>
                    <option value="RS1">RS1</option>
                    <option value="Rubble">Rubble</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Select Unit</label>
                  <select 
                    value={unit} 
                    onChange={(e) => {
                      setUnit(e.target.value);
                      setQtyInCum("");
                      if (e.target.value !== "cum") {
                        setEstimatedQuantity(0);
                        setDeliveredQuantity(0);
                      }
                    }}
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs text-black bg-white focus:outline-none focus:border-black"
                  >
                    <option value="cft">cft (cubic feet)</option>
                    <option value="cum">cum (m³)</option>
                    <option value="sqm">sqm</option>
                    <option value="meter">meter</option>
                  </select>
                </div>
                {unit === "cum" && (
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Quantity in CUM</label>
                    <input 
                      type="number" 
                      step="any"
                      required 
                      value={qtyInCum} 
                      onChange={(e) => {
                        const cumVal = e.target.value === "" ? "" : Number(e.target.value);
                        setQtyInCum(cumVal);
                        if (cumVal !== "") {
                          const cftVal = Math.round(cumVal * 35.3147 * 1000) / 1000;
                          if (itemType === 'to_deliver') {
                            setEstimatedQuantity(cftVal);
                          } else {
                            setDeliveredQuantity(cftVal);
                          }
                        }
                      }} 
                      className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono text-black bg-white" 
                    />
                  </div>
                )}
                {itemType === 'to_deliver' ? (
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Estimated Quantity {unit === "cum" ? "(Auto-calculated CFT)" : `(${unit})`}</label>
                    <input 
                      type="number" 
                      required 
                      readOnly={unit === "cum"}
                      value={estimatedQuantity === 0 ? "" : estimatedQuantity} 
                      onChange={(e) => setEstimatedQuantity(e.target.value === "" ? 0 : Number(e.target.value))} 
                      className={`w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono ${unit === "cum" ? "bg-neutral-50 text-neutral-500 cursor-not-allowed" : "text-black bg-white"}`} 
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Delivered Qty {unit === "cum" ? "(Auto-calculated CFT)" : `(${unit})`}</label>
                    <input 
                      type="number" 
                      required 
                      readOnly={unit === "cum"}
                      value={deliveredQuantity === 0 ? "" : deliveredQuantity} 
                      onChange={(e) => setDeliveredQuantity(e.target.value === "" ? 0 : Number(e.target.value))} 
                      className={`w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono ${unit === "cum" ? "bg-neutral-50 text-neutral-500 cursor-not-allowed" : "text-black bg-white"}`} 
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-neutral-50 pt-3">
                <button type="button" onClick={clearForm} className="px-3 py-1 border border-neutral-200 text-xs rounded">Clear</button>
                <button type="button" onClick={() => setShowItemForm(false)} className="px-3 py-1 border border-neutral-200 text-xs rounded">Cancel</button>
                <button type="submit" className="px-3 py-1 bg-black text-white text-xs rounded hover:bg-neutral-900">Save</button>
              </div>
            </form>
          )}

          {/* Table 1: Materials To Be Delivered */}
          <div className="border border-neutral-200 bg-white rounded overflow-hidden">
            <div className="bg-neutral-50 p-3 border-b border-neutral-200 flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase text-neutral-800">1. Estimate Quantity</h3>
              <button 
                onClick={() => { setItemType('to_deliver'); setShowItemForm(true); setItemSlNo((toDeliverList.length + 1).toString()); }}
                className="px-2 py-1 bg-black text-white hover:bg-neutral-900 text-[10px] font-bold uppercase rounded flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                  <th className="p-3">Sl No</th>
                  <th className="p-3">Spec Name</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Est. Qty</th>
                  <th className="p-3 text-right">Delivered Qty In CFT</th>
                  <th className="p-3 text-right">Bal Qty In CFT</th>
                  <th className="p-3 text-right">Total Qty In Site</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredToDeliver.map(item => {
                  const actualDelivered = deliveredList
                    .filter(d => d.specName === item.specName)
                    .reduce((sum, d) => sum + d.deliveredQuantityInCft, 0);
                  const currentBalance = item.estimatedQuantity - actualDelivered;
                  
                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/50">
                      <td className="p-3 font-mono">{item.itemSlNo}</td>
                      <td className="p-3 font-semibold">{item.specName}</td>
                      <td className="p-3 text-[10px] font-bold uppercase text-neutral-500">{item.unit || "cft"}</td>
                      <td className="p-3 text-right font-mono">
                        {editingItemId === item.id && itemType === 'to_deliver' ? (
                          <input type="number" value={estimatedQuantity === 0 ? "" : estimatedQuantity} onChange={(e) => setEstimatedQuantity(e.target.value === "" ? 0 : Number(e.target.value))} className="w-16 p-0.5 border rounded" />
                        ) : (
                          item.estimatedQuantity
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{actualDelivered}</td>
                      <td className="p-3 text-right font-mono font-bold">{currentBalance}</td>
                      <td className="p-3 text-right font-mono font-bold text-black">{actualDelivered}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2">
                          {editingItemId === item.id && itemType === 'to_deliver' ? (
                            <>
                              <button onClick={() => handleSaveEdit(item.id)} className="text-green-600 hover:text-green-800 mr-2">Save</button>
                              <button onClick={handleCancelEdit} className="text-red-600 hover:text-red-800">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => handleEditItem(item, 'to_deliver')} className="text-neutral-500 hover:text-black">
                                <Edit2 className="w-3.5 h-3.5 inline-block" />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)} className="text-neutral-500 hover:text-black">
                                <Trash2 className="w-3.5 h-3.5 inline-block" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredToDeliver.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-neutral-400">No estimated delivery plans logged.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Table 2: Stock Delivered In Site */}
          <div className="border border-neutral-200 bg-white rounded overflow-hidden">
            <div className="bg-neutral-50 p-3 border-b border-neutral-200 flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase text-neutral-800">2. Actual Quantity delivered in site</h3>
              <button 
                onClick={() => { setItemType('delivered'); setShowItemForm(true); setItemSlNo((deliveredList.length + 1).toString()); }}
                className="px-2 py-1 bg-black text-white hover:bg-neutral-900 text-[10px] font-bold uppercase rounded flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                  <th className="p-3">Sl No</th>
                  <th className="p-3">Spec Name</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Est. Qty</th>
                  <th className="p-3 text-right">Delivered Qty In CFT</th>
                  <th className="p-3 text-right">Bal Qty In CFT</th>
                  <th className="p-3 text-right">Total Qty In Site</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredDelivered.map(item => {
                  const totalEstimated = toDeliverList
                    .filter(est => est.specName === item.specName)
                    .reduce((sum, est) => sum + est.estimatedQuantity, 0);
                  const totalDelivered = deliveredList
                    .filter(d => d.specName === item.specName)
                    .reduce((sum, d) => sum + d.deliveredQuantityInCft, 0);
                  const overallBalance = totalEstimated - totalDelivered;
                  
                  const isEstimated = toDeliverList.some(est => est.specName === item.specName);
                  const isOverDelivered = isEstimated && totalDelivered > totalEstimated;
                  
                  let rowStyle = {};
                  if (!isEstimated) {
                    rowStyle = { backgroundColor: '#fee2e2', color: '#7f1d1d' };
                  } else if (isOverDelivered) {
                    rowStyle = { backgroundColor: '#ffedd5', color: '#7c2d12' };
                  }
                  
                  return (
                    <tr key={item.id} style={rowStyle} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="p-3 font-mono">{item.itemSlNo}</td>
                      <td className="p-3 font-semibold">{item.specName}</td>
                      <td className="p-3 text-[10px] font-bold uppercase text-neutral-500">{item.unit || "cft"}</td>
                      <td className="p-3 text-right font-mono">{totalEstimated}</td>
                      <td className="p-3 text-right font-mono">
                        {editingItemId === item.id && itemType === 'delivered' ? (
                          <input type="number" value={deliveredQuantity === 0 ? "" : deliveredQuantity} onChange={(e) => setDeliveredQuantity(e.target.value === "" ? 0 : Number(e.target.value))} className="w-16 p-0.5 border rounded" />
                        ) : (
                          item.deliveredQuantityInCft
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">{overallBalance}</td>
                      <td className="p-3 text-right font-mono font-bold">{totalDelivered}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2">
                          {editingItemId === item.id && itemType === 'delivered' ? (
                            <>
                              <button onClick={() => handleSaveEdit(item.id)} className="text-green-600 hover:text-green-800 mr-2">Save</button>
                              <button onClick={handleCancelEdit} className="text-red-600 hover:text-red-800">Cancel</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => handleEditItem(item, 'delivered')} className="text-neutral-500 hover:text-black">
                                <Edit2 className="w-3.5 h-3.5 inline-block" />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)} className="text-neutral-500 hover:text-black">
                                <Trash2 className="w-3.5 h-3.5 inline-block" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredDelivered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-neutral-400">No site arrivals registered yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MODULE 5 – PRIVATE WORK STATUS / ENTRY
// ==========================================
export function PrivateWorkView({
  privateWorks,
  onRefresh,
  onCreatePrivateWork,
  onUpdatePrivateWork,
  onDeletePrivateWork,
  onNavigate,
}: {
  privateWorks: PrivateWork[];
  onRefresh: () => void;
  onCreatePrivateWork: (data: any) => Promise<any>;
  onUpdatePrivateWork: (id: string, data: any) => Promise<any>;
  onDeletePrivateWork: (id: string) => Promise<any>;
  onNavigate: (tab: string) => void
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPrivateWork, setSelectedPrivateWork] = useState<PrivateWork | null>(null);

  // States
  const [workName, setWorkName] = useState("");
  const [approxAmount, setApproxAmount] = useState(0);
  const [location, setLocation] = useState("");
  const [relatedToContractWork, setRelatedToContractWork] = useState("");
  const [siteVisitDate, setSiteVisitDate] = useState("");
  const [roadWorkNature, setRoadWorkNature] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [advanceReceived, setAdvanceReceived] = useState(0);
  const [approxFinalWorkAmount, setApproxFinalWorkAmount] = useState(0);
  const [paymentReceived, setPaymentReceived] = useState(0);
  const [remarks, setRemarks] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const clearForm = () => {
    setWorkName("");
    setApproxAmount(0);
    setLocation("");
    setRelatedToContractWork("");
    setSiteVisitDate("");
    setRoadWorkNature("");
    setCompletedDate("");
    setAdvanceReceived(0);
    setApproxFinalWorkAmount(0);
    setPaymentReceived(0);
    setRemarks("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        workName,
        approxAmount: Number(approxAmount),
        location,
        relatedToContractWork,
        siteVisitDate,
        roadWorkNature,
        completedDate,
        advanceReceived: Number(advanceReceived),
        approxFinalWorkAmount: Number(approxFinalWorkAmount),
        paymentReceived: Number(paymentReceived),
        remarks
      };
      if (editingId) {
        await onUpdatePrivateWork(editingId, payload);
      } else {
        await onCreatePrivateWork(payload);
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (w: PrivateWork) => {
    setEditingId(w.id);
    setWorkName(w.workName);
    setApproxAmount(w.approxAmount);
    setLocation(w.location);
    setRelatedToContractWork(w.relatedToContractWork || "");
    setSiteVisitDate(formatDate(w.siteVisitDate));
    setRoadWorkNature(w.roadWorkNature);
    setCompletedDate(formatDate(w.completedDate));
    setAdvanceReceived(w.advanceReceived);
    setApproxFinalWorkAmount(w.approxFinalWorkAmount);
    setPaymentReceived(w.paymentReceived);
    setRemarks(w.remarks || "");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this private work record?")) {
      await onDeletePrivateWork(id);
      onRefresh();
    }
  };

  const filtered = privateWorks.filter(w => 
    w.workName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Private Works</h2>
          <p className="text-xs text-neutral-500">Track and maintain status sheets for direct non-tender private civil jobs.</p>
        </div>
        <div className="flex gap-2">
          {!showForm && (
            <button 
              onClick={() => { clearForm(); setEditingId(null); setShowForm(true); }}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded"
            >
              New Private Work
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="border border-black bg-white p-5 rounded space-y-4">
          <h3 className="text-sm font-bold border-b border-neutral-100 pb-2">{editingId ? "Update Private Work details" : "New Private Work"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Work Name</label>
              <input 
                type="text" required value={workName} onChange={(e) => setWorkName(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Approx Amount (₹)</label>
              <input 
                type="number" required value={approxAmount === 0 ? "" : approxAmount} onChange={(e) => setApproxAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Location</label>
              <input 
                type="text" required value={location} onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Related To Contract Work (If Any)</label>
              <input 
                type="text" value={relatedToContractWork} onChange={(e) => setRelatedToContractWork(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
                placeholder="Link to Government project"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Site Visit Date</label>
              <input 
                type="date" required value={siteVisitDate} onChange={(e) => setSiteVisitDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Road/Work Nature</label>
              <input 
                type="text" required value={roadWorkNature} onChange={(e) => setRoadWorkNature(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
                placeholder="e.g. Asphalting, Tiling"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Advance Received (₹)</label>
              <input 
                type="number" value={advanceReceived === 0 ? "" : advanceReceived} onChange={(e) => setAdvanceReceived(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Approx Final Work Amount (₹)</label>
              <input 
                type="number" required value={approxFinalWorkAmount === 0 ? "" : approxFinalWorkAmount} onChange={(e) => setApproxFinalWorkAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Payment Received (₹)</label>
              <input 
                type="number" required value={paymentReceived === 0 ? "" : paymentReceived} onChange={(e) => setPaymentReceived(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Payment Balance (₹)</label>
              <div className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded text-xs font-mono font-bold">
                ₹{(approxFinalWorkAmount - paymentReceived).toLocaleString()}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Completed Date</label>
              <input 
                type="date" required value={completedDate} onChange={(e) => setCompletedDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div className="col-span-1 md:col-span-3">
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Remarks</label>
              <textarea 
                rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t border-neutral-100 pt-3">
            <button type="button" onClick={clearForm} className="px-3 py-1.5 border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold rounded">Clear</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1.5 border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold rounded">Cancel</button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded disabled:opacity-50"
            >
              {isSaving ? "Saving..." : (editingId ? "Update" : "Save")}
            </button>
          </div>
        </form>
      )}

      {/* Main Table view */}
      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input 
              type="text" placeholder="Search work title or location..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                <th className="p-3">Work Name</th>
                <th className="p-3">Location</th>
                <th className="p-3">Nature</th>
                <th className="p-3 text-right">Approx Amt</th>
                <th className="p-3 text-right">Final Amt</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-right">Completed Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(w => (
                <tr key={w.id} className="hover:bg-neutral-50/50">
                  <td className="p-3 font-bold">
                    <button 
                      onClick={() => setSelectedPrivateWork(w)}
                      className="font-bold text-black hover:underline text-left cursor-pointer focus:outline-none bg-transparent border-none p-0"
                    >
                      {w.workName}
                    </button>
                  </td>
                  <td className="p-3">{w.location}</td>
                  <td className="p-3">{w.roadWorkNature}</td>
                  <td className="p-3 text-right font-mono">₹{w.approxAmount.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold">₹{w.approxFinalWorkAmount.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-neutral-600">₹{w.paymentReceived.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold">₹{w.paymentBalance.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono">{formatDate(w.completedDate)}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(w)} className="p-1 hover:bg-neutral-100 rounded text-neutral-600">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(w.id)} className="p-1 hover:bg-neutral-150 rounded text-neutral-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-neutral-400">No private works logged.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Detail Modal */}
      {selectedPrivateWork && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
          <div className="bg-white border border-neutral-300 w-full max-w-2xl rounded shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Private Work details</span>
                <h3 className="text-sm font-bold text-black uppercase mt-0.5">{selectedPrivateWork.workName}</h3>
              </div>
              <button 
                onClick={() => setSelectedPrivateWork(null)} 
                className="p-1 hover:bg-neutral-200 rounded text-neutral-500 hover:text-black cursor-pointer bg-transparent border-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-neutral-700 text-left">
              {/* General details */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-3">Work Overview</h4>
                <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Location</span>
                    <span className="font-semibold text-black">{selectedPrivateWork.location}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Nature of Work</span>
                    <span className="font-semibold text-black">{selectedPrivateWork.roadWorkNature}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Related Government Contract</span>
                    <span className="font-semibold text-black">{selectedPrivateWork.relatedToContractWork || "None"}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Site Visit Date</span>
                    <span className="font-mono font-semibold text-black">{formatDate(selectedPrivateWork.siteVisitDate)}</span>
                  </div>
                </div>
              </div>

              {/* Financial info */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-3">Financial Summary</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6">
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Estimated Amount</span>
                    <span className="font-mono font-bold text-black">₹{selectedPrivateWork.approxAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Final Valuation Amount</span>
                    <span className="font-mono font-bold text-black">₹{selectedPrivateWork.approxFinalWorkAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Advance Payment</span>
                    <span className="font-mono font-semibold text-black">₹{selectedPrivateWork.advanceReceived.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Total Payments Received</span>
                    <span className="font-mono font-semibold text-black">₹{selectedPrivateWork.paymentReceived.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Outstanding Balance</span>
                    <span className="font-mono font-bold text-red-600">₹{selectedPrivateWork.paymentBalance.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-neutral-400 uppercase">Completion Date</span>
                    <span className="font-mono font-semibold text-black">{formatDate(selectedPrivateWork.completedDate)}</span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              {selectedPrivateWork.remarks && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-black border-b border-neutral-200 pb-1 mb-2">Remarks & Notes</h4>
                  <p className="bg-neutral-50 border border-neutral-100 p-3 rounded text-neutral-600 italic whitespace-pre-wrap">
                    {selectedPrivateWork.remarks}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-2">
              <button 
                onClick={() => { handleEdit(selectedPrivateWork); setSelectedPrivateWork(null); }}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-800 text-xs font-semibold rounded cursor-pointer"
              >
                Edit Details
              </button>
              <button 
                onClick={() => setSelectedPrivateWork(null)}
                className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MODULE 6 – TAR LOAD UPDATION
// ==========================================
export function TarLoadView({
  tarLoads,
  onRefresh,
  onCreateTarLoad,
  onUpdateTarLoad,
  onDeleteTarLoad,
  onNavigate,
}: {
  tarLoads: TarLoad[];
  onRefresh: () => void;
  onCreateTarLoad: (data: any) => Promise<any>;
  onUpdateTarLoad: (id: string, data: any) => Promise<any>;
  onDeleteTarLoad: (id: string) => Promise<any>;
  onNavigate: (tab: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // States
  const [purchasedFrom, setPurchasedFrom] = useState("");
  const [item, setItem] = useState<'Cement' | 'RS1' | 'SS1' | 'VG30'>("VG30");
  const [quantityInKg, setQuantityInKg] = useState(0);
  const [loadInNoOfPack, setLoadInNoOfPack] = useState(0);
  const [addressedOffice, setAddressedOffice] = useState("");
  const [amountPerLoad, setAmountPerLoad] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [purchasedDate, setPurchasedDate] = useState("");
  const [billingNameBuyer, setBillingNameBuyer] = useState("");
  const [remarks, setRemarks] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const clearForm = () => {
    setPurchasedFrom("");
    setItem("VG30");
    setQuantityInKg(0);
    setLoadInNoOfPack(0);
    setAddressedOffice("");
    setAmountPerLoad(0);
    setPaidAmount(0);
    setPurchasedDate("");
    setBillingNameBuyer("");
    setRemarks("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        purchasedFrom,
        item,
        quantityInKg: Number(quantityInKg),
        loadInNoOfPack: Number(loadInNoOfPack),
        addressedOffice,
        amountPerLoad: Number(amountPerLoad),
        paidAmount: Number(paidAmount),
        purchasedDate,
        billingNameBuyer,
        remarks
      };
      if (editingId) {
        await onUpdateTarLoad(editingId, payload);
      } else {
        await onCreateTarLoad(payload);
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (load: TarLoad) => {
    setEditingId(load.id);
    setPurchasedFrom(load.purchasedFrom);
    setItem(load.item);
    setQuantityInKg(load.quantityInKg);
    setLoadInNoOfPack(load.loadInNoOfPack);
    setAddressedOffice(load.addressedOffice);
    setAmountPerLoad(load.amountPerLoad || 0);
    setPaidAmount(load.paidAmount);
    setPurchasedDate(formatDate(load.purchasedDate));
    setBillingNameBuyer(load.billingNameBuyer);
    setRemarks(load.remarks || "");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this tar load sheet?")) {
      await onDeleteTarLoad(id);
      onRefresh();
    }
  };

  const totalKg = tarLoads.reduce((sum, item) => sum + item.quantityInKg, 0);
  const totalPacks = tarLoads.reduce((sum, item) => sum + item.loadInNoOfPack, 0);
  const totalAmount = tarLoads.reduce((sum, item) => sum + (item.amountPerLoad || 0), 0);
  const totalPaid = tarLoads.reduce((sum, item) => sum + item.paidAmount, 0);
  const totalBalance = totalAmount - totalPaid;

  const filtered = tarLoads.filter(t => 
    t.purchasedFrom.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Action Toolbar */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => exportCSV(tarLoads, "tar_loads")}
          className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
        >
          Export Excel
        </button>
        <button
          onClick={() => window.print()}
          className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
        >
          Print
        </button>
        <button
          onClick={() => onNavigate("dashboard")}
          className="px-3 py-1.5 border border-neutral-300 text-xs font-semibold hover:bg-neutral-100 rounded text-black bg-white cursor-pointer"
        >
          Back
        </button>
      </div>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Tar Load Updation</h2>
          <p className="text-xs text-neutral-500">Log incoming road paving emulsions, VG-30 Bitumen packs, and calculate balances.</p>
        </div>
        <div className="flex gap-2">
          {!showForm && (
            <button 
              onClick={() => { clearForm(); setEditingId(null); setShowForm(true); }}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded"
            >
              New Tar Load
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total KG Received</div>
          <div className="text-xl font-mono font-bold mt-1">{totalKg.toLocaleString()} KG</div>
        </div>
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total No. of Pack</div>
          <div className="text-xl font-mono font-bold mt-1">{totalPacks} Packs</div>
        </div>
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Total Purchase bill</div>
          <div className="text-xl font-mono font-bold mt-1">₹{totalAmount.toLocaleString()}</div>
        </div>
        <div className="border border-neutral-200 bg-white p-4 rounded">
          <div className="text-[10px] uppercase font-bold text-neutral-400">Outstanding Balance</div>
          <div className="text-xl font-mono font-bold mt-1 text-black">₹{totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="border border-black bg-white p-5 rounded space-y-4">
          <h3 className="text-sm font-bold border-b border-neutral-100 pb-2">{editingId ? "Update Tar Load" : "New Tar Load Details"}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Purchased From</label>
              <input 
                type="text" required value={purchasedFrom} onChange={(e) => setPurchasedFrom(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Tar Emulsion / Item</label>
              <select 
                value={item} onChange={(e) => setItem(e.target.value as any)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              >
                <option value="Cement">Cement</option>
                <option value="RS1">RS1</option>
                <option value="SS1">SS1</option>
                <option value="VG30">VG30</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Quantity In KG</label>
              <input 
                type="number" required value={quantityInKg === 0 ? "" : quantityInKg} onChange={(e) => setQuantityInKg(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Load In No. Of Pack</label>
              <input 
                type="number" required value={loadInNoOfPack === 0 ? "" : loadInNoOfPack} onChange={(e) => setLoadInNoOfPack(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Addressed Office</label>
              <input 
                type="text" required value={addressedOffice} onChange={(e) => setAddressedOffice(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Purchased Date</label>
              <input 
                type="date" required value={purchasedDate} onChange={(e) => setPurchasedDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Amount Per Load</label>
              <input 
                type="number" required value={amountPerLoad === 0 ? "" : amountPerLoad} onChange={(e) => setAmountPerLoad(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Paid Amount</label>
              <input 
                type="number" required value={paidAmount === 0 ? "" : paidAmount} onChange={(e) => setPaidAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Balance To Be Paid</label>
              <div className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded text-xs font-mono font-bold">
                ₹{(amountPerLoad - paidAmount).toLocaleString()}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Billing Name/Buyer</label>
              <input 
                type="text" required value={billingNameBuyer} onChange={(e) => setBillingNameBuyer(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold"
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Remarks</label>
              <textarea 
                rows={1} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t border-neutral-100 pt-3">
            <button type="button" disabled={saving} onClick={clearForm} className="px-3 py-1.5 border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold rounded disabled:opacity-50">Clear</button>
            <button type="button" disabled={saving} onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1.5 border border-neutral-200 hover:bg-neutral-50 text-xs font-semibold rounded disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded disabled:opacity-50">{saving ? "Saving..." : (editingId ? "Update" : "Save")}</button>
          </div>
        </form>
      )}

      {/* Main Table view */}
      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input 
              type="text" placeholder="Search vendor or material..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                <th className="p-3">Purchase Date</th>
                <th className="p-3">Party Name</th>
                <th className="p-3">Material Item</th>
                <th className="p-3 text-right">Quantity In KG</th>
                <th className="p-3 text-right">Load In Packs</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Paid Amount</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(load => (
                <tr key={load.id} className="hover:bg-neutral-50/50">
                  <td className="p-3 font-mono">{formatDate(load.purchasedDate)}</td>
                  <td className="p-3 font-bold">{load.purchasedFrom}</td>
                  <td className="p-3"><span className="border border-neutral-300 px-1 py-0.5 rounded font-bold font-mono">{load.item}</span></td>
                  <td className="p-3 text-right font-mono">{load.quantityInKg.toLocaleString()} KG</td>
                  <td className="p-3 text-right font-mono">{load.loadInNoOfPack} Packs</td>
                  <td className="p-3 text-right font-mono font-bold">₹{(load.amountPerLoad || 0).toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-neutral-600">₹{load.paidAmount.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold">₹{((load.amountPerLoad || 0) - load.paidAmount).toLocaleString()}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleEdit(load)} className="p-1 hover:bg-neutral-100 rounded text-neutral-600">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(load.id)} className="p-1 hover:bg-neutral-150 rounded text-neutral-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-neutral-400">No tar load records logged.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MODULE 7 – WORK BASED ENTRY
// ==========================================
export function WorkBasedEntryView({
  entries,
  privateWorks = [],
  workBasedEntries,
  onRefresh,
  onCreateWorkBasedEntry,
  onUpdateWorkBasedEntry,
  onDeleteWorkBasedEntry,
  onNavigate
}: {
  entries: Entry[];
  privateWorks?: PrivateWork[];
  workBasedEntries: WorkBasedEntry[];
  onRefresh: () => void;
  onCreateWorkBasedEntry: (data: any) => Promise<any>;
  onUpdateWorkBasedEntry: (id: string, data: any) => Promise<any>;
  onDeleteWorkBasedEntry: (id: string) => Promise<any>;
  onNavigate: (tab: string) => void}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleWorkSearch = (query: string) => {
    setSearchQuery(query);
    if (!query) {
      setSelectedEntryId("");
      return;
    }
    const combined = [
      ...entries.map(e => ({ id: e.id, name: e.workName })),
      ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName }))
    ];
    const match = combined.find(opt => 
      opt.name.toLowerCase().includes(query.toLowerCase())
    );
    if (match) {
      setSelectedEntryId(match.id);
    } else {
      setSelectedEntryId("");
    }
  };

  // States
  const [itemSlNo, setItemSlNo] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemQuantity, setItemQuantity] = useState(0);
  const [itemRateAsPerEstimate, setItemRateAsPerEstimate] = useState(0);
  const [itemUnit, setItemUnit] = useState("CUM");

  const clearForm = () => {
    setItemSlNo("");
    setItemName("");
    setItemQuantity(0);
    setItemRateAsPerEstimate(0);
    setItemUnit("CUM");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryId || isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        entryId: selectedEntryId,
        itemSlNo,
        itemName,
        itemQuantity: Number(itemQuantity),
        itemRateAsPerEstimate: Number(itemRateAsPerEstimate),
        itemUnit
      };
      if (editingId) {
        await onUpdateWorkBasedEntry(editingId, payload);
      } else {
        await onCreateWorkBasedEntry(payload);
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (wbe: WorkBasedEntry) => {
    setEditingId(wbe.id);
    setItemSlNo(wbe.itemSlNo);
    setItemName(wbe.itemName);
    setItemQuantity(wbe.itemQuantity);
    setItemRateAsPerEstimate(wbe.itemRateAsPerEstimate);
    setItemUnit(wbe.itemUnit);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this BOQ line item?")) {
      await onDeleteWorkBasedEntry(id);
      onRefresh();
    }
  };

  const filteredItems = workBasedEntries.filter(wbe => wbe.entryId === selectedEntryId);
  const totalBOQValuation = filteredItems.reduce((sum, item) => sum + item.totalAmountPerItem, 0);

  const filteredWorkOptions = [
    ...entries.map(e => ({ id: e.id, name: e.workName, type: 'entry' as const })),
    ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName, type: 'private' as const }))
  ].filter(opt => opt.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Work Based Entry (Item Estimator)</h2>
        <p className="text-xs text-neutral-500 font-medium">Link detailed bill-of-quantities (BOQ) specifications and rates to concrete projects.</p>
      </div>

      {/* Search Input */}
      <div className="relative w-64 mb-4">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
        <input 
          type="text" placeholder="Search work name..." value={searchQuery} onChange={(e) => handleWorkSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
        />
      </div>

      <div className="border border-neutral-200 bg-white p-4 rounded space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1.5">Select Work Name</label>
          <select 
            value={selectedEntryId} onChange={(e) => setSelectedEntryId(e.target.value)}
            className="w-full md:w-1/2 px-3 py-2 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold text-black bg-white"
          >
            <option value="">-- Select Active Work --</option>
            {filteredWorkOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.name}{opt.type === 'private' ? " (Private)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedEntryId && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center bg-neutral-50 p-4 border border-neutral-200 rounded">
            <div>
              <span className="text-[9px] uppercase font-bold text-neutral-400">Total BOQ Estimate Value</span>
              <div className="text-lg font-mono font-bold text-black">₹{totalBOQValuation.toLocaleString()}</div>
            </div>
            {!showForm && (
              <button 
                onClick={() => { clearForm(); setEditingId(null); setShowForm(true); }}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded uppercase tracking-wider flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Estimate Item
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={handleSave} className="border border-black bg-white p-4 rounded space-y-4">
              <h4 className="text-xs font-bold uppercase border-b border-neutral-100 pb-2">{editingId ? "Update BOQ Item" : "New BOQ Item Details"}</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Item Sl No</label>
                  <input type="text" placeholder="e.g. 1.1" required value={itemSlNo} onChange={(e) => setItemSlNo(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Item Name/Spec</label>
                  <input type="text" required value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Item Quantity</label>
                  <input type="number" required value={itemQuantity === 0 ? "" : itemQuantity} onChange={(e) => setItemQuantity(e.target.value === "" ? 0 : Number(e.target.value))} className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Item Rate</label>
                  <input type="number" required value={itemRateAsPerEstimate === 0 ? "" : itemRateAsPerEstimate} onChange={(e) => setItemRateAsPerEstimate(e.target.value === "" ? 0 : Number(e.target.value))} className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Item Unit</label>
                  <input type="text" required value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono" placeholder="CUM, KG, TON" />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-neutral-50 pt-3">
                <button type="button" onClick={clearForm} className="px-3 py-1 border border-neutral-200 text-xs rounded">Clear</button>
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1 border border-neutral-200 text-xs rounded">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-3 py-1 bg-black text-white text-xs rounded hover:bg-neutral-900 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : (editingId ? "Update" : "Save")}
                </button>
              </div>
            </form>
          )}

          {/* Table */}
          <div className="border border-neutral-200 bg-white rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                  <th className="p-3">Item Sl No</th>
                  <th className="p-3">Specification Name</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Estimated Rate</th>
                  <th className="p-3 text-right">Total Amount Per Item</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-neutral-50/50">
                    <td className="p-3 font-mono font-bold">{item.itemSlNo}</td>
                    <td className="p-3 font-semibold">{item.itemName}</td>
                    <td className="p-3 text-right font-mono">{item.itemQuantity.toLocaleString()}</td>
                    <td className="p-3"><span className="bg-neutral-100 px-1 py-0.5 rounded font-bold font-mono">{item.itemUnit}</span></td>
                    <td className="p-3 text-right font-mono">₹{item.itemRateAsPerEstimate.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-black border-l border-neutral-50">
                      ₹{item.totalAmountPerItem.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleEdit(item)} className="p-1 hover:bg-neutral-100 rounded text-neutral-600">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 hover:bg-neutral-150 rounded text-neutral-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                 ))}
                {filteredItems.length > 0 && (
                  <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                    <td className="p-3"></td>
                    <td className="p-3 text-left">TOTAL</td>
                    <td className="p-3"></td>
                    <td className="p-3"></td>
                    <td className="p-3"></td>
                    <td className="p-3 text-right font-mono text-black border-l border-neutral-200">
                      ₹{totalBOQValuation.toLocaleString()}
                    </td>
                    <td className="p-3"></td>
                  </tr>
                )}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-neutral-400">No BOQ items logged for this work entry.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MODULE 8 – WORK BASED REGISTER
// ==========================================
export function WorkBasedRegisterView({
  entries,
  privateWorks = [],
  workBasedEntries,
  expenses = []
}: {
  entries: Entry[];
  privateWorks?: PrivateWork[];
  workBasedEntries: WorkBasedEntry[];
  expenses?: Expense[];
}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [mlaMp, setMlaMp] = useState("");
  
  // Status checkboxes
  const [ongoing, setOngoing] = useState(true);
  const [pending, setPending] = useState(true);
  const [notStarted, setNotStarted] = useState(true);
  const [completed, setCompleted] = useState(true);

  // Combine entries and private works for unified register filtering
  const allWorks = [
    ...entries.map(e => ({
      id: e.id,
      workName: e.workName,
      amount: e.amount,
      mlaMpName: e.mlaMpName || "",
      agreementNo: e.agreementNo || "",
      status: e.status,
      type: 'entry' as const,
      original: e
    })),
    ...(privateWorks || []).map(p => ({
      id: p.id,
      workName: p.workName,
      amount: p.approxFinalWorkAmount,
      mlaMpName: "",
      agreementNo: "",
      status: 'Ongoing' as const,
      type: 'private' as const,
      original: p
    }))
  ];

  // Filter the list of entries shown in dropdown/tables
  const filteredWorks = allWorks.filter(w => {
    if (keyword) {
      const matchName = w.workName.toLowerCase().includes(keyword.toLowerCase());
      const matchAgreement = w.agreementNo.toLowerCase().includes(keyword.toLowerCase());
      if (!matchName && !matchAgreement) return false;
    }
    if (minAmount && !String(w.amount).includes(minAmount)) return false;
    if (mlaMp && !w.mlaMpName.toLowerCase().includes(mlaMp.toLowerCase())) return false;
    
    // Status filter
    if (w.status === 'Ongoing' && !ongoing) return false;
    if (w.status === 'Pending' && !pending) return false;
    if (w.status === 'Not Started' && !notStarted) return false;
    if (w.status === 'Completed' && !completed) return false;

    return true;
  });

  // Automatically select the first matching work when filters change
  const filtersActive = keyword || minAmount || mlaMp || !ongoing || !pending || !notStarted || !completed;
  
  useEffect(() => {
    if (filtersActive && filteredWorks.length > 0) {
      setSelectedEntryId(filteredWorks[0].id);
    } else if (filtersActive && filteredWorks.length === 0) {
      setSelectedEntryId("");
    } else if (!filtersActive) {
      // No filters active — clear auto-selection so user picks manually
      setSelectedEntryId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, minAmount, mlaMp, ongoing, pending, notStarted, completed]);

  const selectedWork = allWorks.find(w => w.id === selectedEntryId);
  const boqItems = workBasedEntries.filter(wbe => wbe.entryId === selectedEntryId);
  const workExpenses = expenses.filter(exp => exp.workId === selectedEntryId);
  const totalWorkExpenses = workExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const projectedProfit = selectedWork ? selectedWork.amount - totalWorkExpenses : 0;
  const realizedProfit = selectedWork ? (selectedWork.original.paymentReceived || 0) - totalWorkExpenses : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Work Based Register</h2>
        <p className="text-xs text-neutral-500 font-medium">Consolidated view of all contract executions with search parameters and filter configurations.</p>
      </div>

      {/* Filter panel */}
      <div className="border border-neutral-200 bg-white p-5 rounded space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 pb-2 border-b border-neutral-100 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-black" /> Filter Parameters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Select Work Name</label>
            <select 
              value={selectedEntryId} onChange={(e) => setSelectedEntryId(e.target.value)}
              className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold"
            >
              <option value="">-- Choose Contract Work --</option>
              {filteredWorks.map(w => (
                <option key={w.id} value={w.id}>
                  {w.workName}{w.type === 'private' ? " (Private)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Keyword Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
              <input 
                type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                placeholder="Work Name or Agreement No"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Search Contract Amount (₹)</label>
            <input 
              type="text" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
              className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              placeholder="e.g. 240000"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">MP/MLA Sponsor</label>
            <input 
              type="text" value={mlaMp} onChange={(e) => setMlaMp(e.target.value)}
              className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              placeholder="MLA/MP Name"
            />
          </div>
        </div>

        {/* Status Checkboxes */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-neutral-50 text-xs">
          <span className="text-[10px] font-bold uppercase text-neutral-500 self-center">Work Status:</span>
          <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
            <input type="checkbox" checked={ongoing} onChange={(e) => setOngoing(e.target.checked)} className="rounded border-neutral-300 text-black focus:ring-black" />
            Ongoing
          </label>
          <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
            <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} className="rounded border-neutral-300 text-black focus:ring-black" />
            Pending
          </label>
          <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
            <input type="checkbox" checked={notStarted} onChange={(e) => setNotStarted(e.target.checked)} className="rounded border-neutral-300 text-black focus:ring-black" />
            Not Started
          </label>
          <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
            <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.target.checked)} className="rounded border-neutral-300 text-black focus:ring-black" />
            Completed
          </label>
        </div>
      </div>

      {/* Matching Works Results Table */}
      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <div className="p-3 bg-neutral-50 border-b border-neutral-200">
          <h3 className="font-bold text-xs uppercase text-neutral-800">Matching Contract & Private Works ({filteredWorks.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                <th className="p-3">Work Name</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Contract Value</th>
                <th className="p-3">Sponsor / MLA-MP</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredWorks.map(w => (
                <tr key={w.id} className={`hover:bg-neutral-50/50 ${selectedEntryId === w.id ? 'bg-neutral-50 font-semibold' : ''}`}>
                  <td className="p-3 font-semibold text-black">{w.workName}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-800 border border-neutral-200">
                      {w.type === 'private' ? 'Private' : 'Contract'}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-black">₹{w.amount.toLocaleString()}</td>
                  <td className="p-3 text-neutral-600">{w.mlaMpName || "N/A"}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-50 text-neutral-700 border border-neutral-100">
                      {w.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button 
                      onClick={() => setSelectedEntryId(w.id)}
                      className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer ${selectedEntryId === w.id ? 'bg-neutral-200 text-black border border-neutral-300' : 'bg-black text-white hover:bg-neutral-900'}`}
                    >
                      {selectedEntryId === w.id ? 'Active' : 'Select'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredWorks.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-400 font-medium">
                    No matching works found for the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedWork && (
        <div className="space-y-6 animate-fade-in bg-white border border-neutral-200 rounded p-6">
          <div className="flex justify-between items-start border-b border-neutral-100 pb-4">
            <div>
              <span className="text-[9px] uppercase font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
                {selectedWork.type === 'private' ? 'Private Work' : selectedWork.status}
              </span>
              <h3 className="text-lg font-bold text-black mt-1">{selectedWork.workName}</h3>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">
                {selectedWork.type === 'private' 
                  ? `Private Client Reference ID: ${selectedWork.id}` 
                  : `Agreement Number: ${selectedWork.agreementNo || "Pending"}`
                }
              </p>
            </div>
            <button 
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded uppercase tracking-wider flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print Sheet
            </button>
          </div>

          {selectedWork.type === 'entry' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs pt-4">
              <div className="space-y-3">
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Office Wing</span>
                  <span className="font-semibold text-neutral-900">{selectedWork.original.nameOfOffice}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">MLA/MP Sponsor</span>
                  <span className="font-semibold text-neutral-900">{selectedWork.original.mlaMpName || "N/A"}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Contract Value</span>
                  <span className="font-mono font-bold text-black text-sm">₹{selectedWork.original.amount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">LOA Issued Status</span>
                  <span className="font-semibold text-neutral-900">{selectedWork.original.loaReceived ? "Yes, Agreement Completed" : "No, Under SLA Review"}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Last Date to Execute Agreement</span>
                  <span className="font-mono font-semibold text-neutral-900">{selectedWork.original.lastDateToExecuteAgreement ? new Date(selectedWork.original.lastDateToExecuteAgreement).toISOString().substring(0,10) : ""}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">DLP Period</span>
                  <span className="font-semibold text-neutral-900">{selectedWork.original.dlpPeriodAsPerInLOA}</span>
                </div>
              </div>

              <div className="space-y-3 border-l border-neutral-100 pl-0 md:pl-6">
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Security Amount Deposit</span>
                  <span className="font-mono font-semibold text-neutral-900">₹{selectedWork.original.securityAmount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Performance Guarantee</span>
                  <span className="font-mono font-semibold text-neutral-900">₹{selectedWork.original.performanceGuarantee.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Payment Settled</span>
                  <span className="font-mono font-bold text-neutral-900">₹{(selectedWork.original.paymentReceived || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs pt-4">
              <div className="space-y-3">
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Location</span>
                  <span className="font-semibold text-neutral-900">{selectedWork.original.location}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Nature of Work</span>
                  <span className="font-semibold text-neutral-900">{selectedWork.original.roadWorkNature || "Civil construction"}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Approximate Amount</span>
                  <span className="font-mono font-bold text-black text-sm">₹{selectedWork.original.approxAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Work Status</span>
                  <span className="font-semibold text-neutral-900">Private Project execution</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Site Visit Date</span>
                  <span className="font-mono font-semibold text-neutral-900">{selectedWork.original.siteVisitDate ? new Date(selectedWork.original.siteVisitDate).toISOString().substring(0,10) : "N/A"}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Completion Target</span>
                  <span className="font-mono font-semibold text-neutral-900">{selectedWork.original.completedDate ? new Date(selectedWork.original.completedDate).toISOString().substring(0,10) : "N/A"}</span>
                </div>
              </div>

              <div className="space-y-3 border-l border-neutral-100 pl-0 md:pl-6">
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Advance Payment Received</span>
                  <span className="font-mono font-semibold text-neutral-900">₹{selectedWork.original.advanceReceived.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Total Payment Settled</span>
                  <span className="font-mono font-semibold text-neutral-900">₹{selectedWork.original.paymentReceived.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[9px] uppercase font-bold">Outstanding Balance</span>
                  <span className="font-mono font-bold text-neutral-900">₹{selectedWork.original.paymentBalance.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Profitability & Financial Ledger */}
          <div className="border border-neutral-200 rounded overflow-hidden mt-6 bg-white">
            <div className="bg-neutral-50 p-3 border-b border-neutral-200">
              <h4 className="font-bold text-xs uppercase text-neutral-800">Project Profitability & Financial Health</h4>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="border border-neutral-100 p-3 rounded">
                <span className="text-neutral-400 block text-[9px] uppercase font-bold">Total Work Revenue</span>
                <span className="font-mono font-bold text-black text-sm">₹{selectedWork.amount.toLocaleString()}</span>
              </div>
              <div className="border border-neutral-100 p-3 rounded">
                <span className="text-neutral-400 block text-[9px] uppercase font-bold">Total Project Expenses</span>
                <span className="font-mono font-bold text-neutral-600 text-sm">₹{totalWorkExpenses.toLocaleString()}</span>
              </div>
              <div className="border border-neutral-100 p-3 rounded">
                <span className="text-neutral-400 block text-[9px] uppercase font-bold">Estimated Net Profit</span>
                <span className={`font-mono font-bold text-sm ${projectedProfit >= 0 ? 'text-black font-extrabold' : 'text-red-600'}`}>
                  ₹{projectedProfit.toLocaleString()}
                </span>
                <span className="text-[10px] text-neutral-500 block mt-1">
                  Margin: {selectedWork.amount > 0 ? ((projectedProfit / selectedWork.amount) * 100).toFixed(1) : 0}%
                </span>
              </div>
              <div className="border border-neutral-100 p-3 rounded">
                <span className="text-neutral-400 block text-[9px] uppercase font-bold">Realized Cash Margin</span>
                <span className={`font-mono font-bold text-sm ${realizedProfit >= 0 ? 'text-black font-extrabold' : 'text-red-600'}`}>
                  ₹{realizedProfit.toLocaleString()}
                </span>
                <span className="text-[10px] text-neutral-500 block mt-1">
                  Received: ₹{(selectedWork.original.paymentReceived || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Item Wise Table */}
          <div className="border border-neutral-200 rounded overflow-hidden mt-6">
            <div className="bg-neutral-50 p-3 border-b border-neutral-200">
              <h4 className="font-bold text-xs uppercase text-neutral-800">Linked Estimate Quantities & Valuation</h4>
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                  <th className="p-3">Sl No</th>
                  <th className="p-3">Spec Name</th>
                  <th className="p-3 text-right">Estimated Quantity</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3 text-right">Contract Rate</th>
                  <th className="p-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {boqItems.map(item => (
                  <tr key={item.id} className="hover:bg-neutral-50/50">
                    <td className="p-3 font-mono">{item.itemSlNo}</td>
                    <td className="p-3 font-semibold">{item.itemName}</td>
                    <td className="p-3 text-right font-mono">{item.itemQuantity.toLocaleString()}</td>
                    <td className="p-3 font-mono">{item.itemUnit}</td>
                    <td className="p-3 text-right font-mono">₹{item.itemRateAsPerEstimate.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-black border-l border-neutral-50">
                      ₹{item.totalAmountPerItem.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {boqItems.length > 0 && (
                  <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                    <td className="p-3"></td>
                    <td className="p-3 text-left">TOTAL</td>
                    <td className="p-3"></td>
                    <td className="p-3"></td>
                    <td className="p-3"></td>
                    <td className="p-3 text-right font-mono text-black border-l border-neutral-200">
                      ₹{boqItems.reduce((sum, item) => sum + item.totalAmountPerItem, 0).toLocaleString()}
                    </td>
                  </tr>
                )}
                {boqItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-neutral-400">No linked estimate items found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MODULE 9 – OFFICE WISE WORK LIST
// ==========================================
export function OfficeWiseWorkView({
  entries
}: {
  entries: Entry[];
}) {
  const [selectedOffice, setSelectedOffice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const officeNames = Array.from(new Set(entries.map(e => e.nameOfOffice)));
  const filteredEntries = (selectedOffice 
    ? entries.filter(e => e.nameOfOffice === selectedOffice) 
    : entries
  ).filter(e => 
    e.workName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (e.agreementNo || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Office Wise Work List</h2>
        <p className="text-xs text-neutral-500 font-medium">Filter consolidated contract items by regional office divisions or municipal departments.</p>
      </div>

      {/* Search Input */}
      <div className="relative w-64 mb-4">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
        <input 
          type="text" placeholder="Search work title or agreement..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
        />
      </div>

      <div className="border border-neutral-200 bg-white p-4 rounded space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1.5">Select Office Wing / Division</label>
          <select 
            value={selectedOffice} onChange={(e) => setSelectedOffice(e.target.value)}
            className="w-full md:w-1/2 px-3 py-2 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold text-black bg-white"
          >
            <option value="">-- All Office Wings --</option>
            {officeNames.map(office => (
              <option key={office} value={office}>{office}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-neutral-200 bg-white rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
              <th className="p-3">Work Name</th>
              <th className="p-3">Office Wing</th>
              <th className="p-3 text-right">Contract Amount</th>
              <th className="p-3">Agreement Number</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Completion Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredEntries.map(e => (
              <tr key={e.id} className="hover:bg-neutral-50/50">
                <td className="p-3 font-bold text-neutral-900">{e.workName}</td>
                <td className="p-3 font-semibold text-neutral-600">{e.nameOfOffice}</td>
                <td className="p-3 text-right font-mono font-bold">₹{e.amount.toLocaleString()}</td>
                <td className="p-3 font-mono">{e.agreementNo || "Pending"}</td>
                <td className="p-3 text-center">
                  <span className="font-semibold text-[10px] uppercase border border-black px-1.5 py-0.5 rounded bg-white text-black">
                    {e.status}
                  </span>
                </td>
                <td className="p-3 text-right font-mono">{formatDate(e.workCompletionDateAsPerAgreement)}</td>
              </tr>
            ))}
            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-neutral-400">No active work lists registered for this office division.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// MODULE 10 – WORK STATUS / UPDATION
// ==========================================
export function WorkStatusUpdationView({
  entries,
  onRefresh,
  onUpdateEntry
}: {
  entries: Entry[];
  onRefresh: () => void;
  onUpdateEntry: (id: string, data: any) => Promise<any>;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleWorkSearch = (query: string) => {
    setSearchQuery(query);
    if (!query) {
      setSelectedEntryId("");
      return;
    }
    const match = entries.find(e => 
      e.workName.toLowerCase().includes(query.toLowerCase())
    );
    if (match) {
      handleSelectWork(match.id);
    } else {
      setSelectedEntryId("");
    }
  };

  // States
  const [workName, setWorkName] = useState("");
  const [amount, setAmount] = useState(0);
  const [nameOfOffice, setNameOfOffice] = useState("");
  const [mlaMpName, setMlaMpName] = useState("");
  const [loaReceived, setLoaReceived] = useState(false);
  const [lastDateToExecuteAgreement, setLastDateToExecuteAgreement] = useState("");
  const [amountOfStampPaperRequired, setAmountOfStampPaperRequired] = useState(0);
  const [securityAmount, setSecurityAmount] = useState(0);
  const [performanceGuarantee, setPerformanceGuarantee] = useState(0);
  const [dlpPeriodAsPerInLOA, setDlpPeriodAsPerInLOA] = useState("");
  const [agreementNo, setAgreementNo] = useState("");
  const [siteHandoverDate, setSiteHandoverDate] = useState("");
  const [workCompletionDateAsPerAgreement, setWorkCompletionDateAsPerAgreement] = useState("");
  const [actualCompletionDate, setActualCompletionDate] = useState("");
  const [status, setStatus] = useState<'Not Started' | 'Ongoing' | 'Pending' | 'Completed'>('Not Started');
  const [paymentReceived, setPaymentReceived] = useState(0);

  const [message, setMessage] = useState("");

  const handleSelectWork = (id: string) => {
    setSelectedEntryId(id);
    setMessage("");
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    setWorkName(entry.workName);
    setAmount(entry.amount);
    setNameOfOffice(entry.nameOfOffice);
    setMlaMpName(entry.mlaMpName || "");
    setLoaReceived(entry.loaReceived);
    setLastDateToExecuteAgreement(formatDate(entry.lastDateToExecuteAgreement));
    setAmountOfStampPaperRequired(entry.amountOfStampPaperRequired);
    setSecurityAmount(entry.securityAmount);
    setPerformanceGuarantee(entry.performanceGuarantee);
    setDlpPeriodAsPerInLOA(entry.dlpPeriodAsPerInLOA);
    setAgreementNo(entry.agreementNo);
    setSiteHandoverDate(formatDate(entry.siteHandoverDate));
    setWorkCompletionDateAsPerAgreement(formatDate(entry.workCompletionDateAsPerAgreement));
    setActualCompletionDate(entry.actualCompletionDate ? formatDate(entry.actualCompletionDate) : "");
    setStatus(entry.status);
    setPaymentReceived(entry.paymentReceived || 0);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryId) return;
    const payload = {
      workName,
      amount: Number(amount),
      nameOfOffice,
      mlaMpName,
      loaReceived,
      lastDateToExecuteAgreement,
      amountOfStampPaperRequired: Number(amountOfStampPaperRequired),
      securityAmount: Number(securityAmount),
      performanceGuarantee: Number(performanceGuarantee),
      dlpPeriodAsPerInLOA,
      agreementNo,
      siteHandoverDate,
      workCompletionDateAsPerAgreement,
      actualCompletionDate: actualCompletionDate || null,
      status,
      paymentReceived: Number(paymentReceived)
    };
    await onUpdateEntry(selectedEntryId, payload);
    setMessage("Success: Work status records updated successfully.");
    onRefresh();
  };

  const filteredEntries = entries.filter(e => 
    e.workName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Work Status / Updation</h2>
        <p className="text-xs text-neutral-500 font-medium">Select an active contract to modify field logs, execute revisions, and toggle completion states.</p>
      </div>

      {/* Search Input */}
      <div className="relative w-64 mb-4">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
        <input 
          type="text" placeholder="Search work name..." value={searchQuery} onChange={(e) => handleWorkSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
        />
      </div>

      <div className="border border-neutral-200 bg-white p-4 rounded space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1.5">Work Selector</label>
          <select 
            value={selectedEntryId} onChange={(e) => handleSelectWork(e.target.value)}
            className="w-full md:w-1/2 px-3 py-2 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold text-black bg-white"
          >
            <option value="">-- Select Work To Update --</option>
            {filteredEntries.map(e => (
              <option key={e.id} value={e.id}>{e.workName}</option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <div className="p-3 border border-black bg-neutral-50 text-xs font-bold rounded animate-fade-in flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-black" /> {message}
        </div>
      )}

      {selectedEntryId && (
        <form onSubmit={handleUpdate} className="border border-black bg-white p-5 rounded space-y-4 animate-fade-in">
          <h3 className="text-sm font-bold border-b border-neutral-100 pb-2">Status sheet for: {workName}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Work Name</label>
              <input 
                type="text" required value={workName} onChange={(e) => setWorkName(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Contract Amount (₹)</label>
              <input 
                type="number" required value={amount === 0 ? "" : amount} onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Name Of Office</label>
              <input 
                type="text" required value={nameOfOffice} onChange={(e) => setNameOfOffice(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">MLA/MP Name (Optional)</label>
              <input 
                type="text" value={mlaMpName} onChange={(e) => setMlaMpName(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">LOA Received</label>
              <select 
                value={loaReceived ? "true" : "false"} onChange={(e) => setLoaReceived(e.target.value === "true")}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none"
              >
                <option value="false">No / Pending</option>
                <option value="true">Yes / Received</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Last Date To Execute Agreement</label>
              <input 
                type="date" required value={lastDateToExecuteAgreement} onChange={(e) => setLastDateToExecuteAgreement(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Amount Of Stamp Paper Required</label>
              <input 
                type="number" required value={amountOfStampPaperRequired === 0 ? "" : amountOfStampPaperRequired} onChange={(e) => setAmountOfStampPaperRequired(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Security Amount</label>
              <input 
                type="number" required value={securityAmount === 0 ? "" : securityAmount} onChange={(e) => setSecurityAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Performance Guarantee</label>
              <input 
                type="number" value={performanceGuarantee === 0 ? "" : performanceGuarantee} onChange={(e) => setPerformanceGuarantee(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">DLP Period As Per LOA</label>
              <input 
                type="text" required value={dlpPeriodAsPerInLOA} onChange={(e) => setDlpPeriodAsPerInLOA(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Agreement No</label>
              <input 
                type="text" required value={agreementNo} onChange={(e) => setAgreementNo(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Site Handover Date</label>
              <input 
                type="date" required value={siteHandoverDate} onChange={(e) => setSiteHandoverDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Work Completion Date As Per Agreement</label>
              <input 
                type="date" required value={workCompletionDateAsPerAgreement} onChange={(e) => setWorkCompletionDateAsPerAgreement(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Actual Completion Date</label>
              <input 
                type="date" value={actualCompletionDate} onChange={(e) => setActualCompletionDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Status</label>
              <select 
                value={status} onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none"
              >
                <option value="Not Started">Not Started</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Pending">Pending</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1">Payment Received (₹)</label>
              <input 
                type="number" value={paymentReceived === 0 ? "" : paymentReceived} onChange={(e) => setPaymentReceived(e.target.value === "" ? 0 : Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t border-neutral-100 pt-3">
            <button 
              type="submit"
              className="px-4 py-2 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded uppercase tracking-wider"
            >
              Update Record
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ==========================================
// MODULE 11 – EXPENSE UPDATION
// ==========================================
const descriptionOptions = [
  "Labour",
  "Food",
  "Machine Rent",
  "Water",
  "Petrol",
  "Diesel",
  "Site Fee",
  "Others"
];

export function ExpenseUpdationView({
  entries,
  privateWorks = [],
  expenses = [],
  onRefresh,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onNavigate
}: {
  entries: Entry[];
  privateWorks?: PrivateWork[];
  expenses: Expense[];
  onRefresh: () => void;
  onCreateExpense: (data: any) => Promise<any>;
  onUpdateExpense: (id: string, data: any) => Promise<any>;
  onDeleteExpense: (id: string) => Promise<any>;
  onNavigate: (tab: string) => void;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const getLocalDateString = () => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000; // in ms
    const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
    return localISOTime;
  };

  // Form Fields
  const [date, setDate] = useState(getLocalDateString());
  const [description, setDescription] = useState("Labour");
  const [customDescription, setCustomDescription] = useState("");
  const [amount, setAmount] = useState<number | "">("");

  useEffect(() => {
    if (!editingId && !showForm) {
      setDate(getLocalDateString());
      setDescription("Labour");
      setCustomDescription("");
      setAmount("");
    }
  }, [editingId, showForm]);

  const handleWorkSearch = (query: string) => {
    setSearchQuery(query);
    if (!query) {
      setSelectedEntryId("");
      return;
    }
    const combined = [
      ...entries.map(e => ({ id: e.id, name: e.workName })),
      ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName }))
    ];
    const match = combined.find(opt => 
      opt.name.toLowerCase().includes(query.toLowerCase())
    );
    if (match) {
      setSelectedEntryId(match.id);
    } else {
      setSelectedEntryId("");
    }
  };

  const clearForm = () => {
    setDate(getLocalDateString());
    setDescription("Labour");
    setCustomDescription("");
    setAmount("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryId || isSaving) return;
    setIsSaving(true);
    try {
      const finalDescription = description === "Others" ? customDescription : description;

      const payload = {
        workId: selectedEntryId,
        date,
        description: finalDescription,
        amount: Number(amount)
      };

      if (editingId) {
        await onUpdateExpense(editingId, payload);
      } else {
        await onCreateExpense(payload);
      }
      clearForm();
      setEditingId(null);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (exp: Expense) => {
    setEditingId(exp.id);
    setDate(formatDate(exp.date));
    if (descriptionOptions.includes(exp.description)) {
      setDescription(exp.description);
      setCustomDescription("");
    } else {
      setDescription("Others");
      setCustomDescription(exp.description);
    }
    setAmount(exp.amount);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this expense record?")) {
      await onDeleteExpense(id);
      onRefresh();
    }
  };

  const filteredExpenses = expenses.filter(exp => exp.workId === selectedEntryId);
  const totalExpenseValuation = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  const filteredWorkOptions = [
    ...entries.map(e => ({ id: e.id, name: e.workName, type: 'entry' as const })),
    ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName, type: 'private' as const }))
  ].filter(opt => opt.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const formatDate = (date: string | Date) => {
  if (!date) return "";
  const dateStr = typeof date === "string" ? date : date.toISOString();
  const parts = dateStr.substring(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0].substring(2);
  const month = parts[1];
  const day = parts[2];
  return `${day}/${month}/${year}`;
};

;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Expense Updation</h2>
        <p className="text-xs text-neutral-500 font-medium">Log and track daily operational expenses associated with ongoing projects.</p>
      </div>

      {/* Search Input */}
      <div className="relative w-64 mb-4">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
        <input 
          type="text" placeholder="Search work name..." value={searchQuery} onChange={(e) => handleWorkSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
        />
      </div>

      <div className="border border-neutral-200 bg-white p-4 rounded space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1.5">Select Work Name</label>
          <select 
            value={selectedEntryId} onChange={(e) => setSelectedEntryId(e.target.value)}
            className="w-full md:w-1/2 px-3 py-2 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold text-black bg-white"
          >
            <option value="">-- Select Active Work --</option>
            {filteredWorkOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.name}{opt.type === 'private' ? " (Private)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedEntryId && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center bg-neutral-50 p-4 border border-neutral-200 rounded">
            <div>
              <span className="text-[9px] uppercase font-bold text-neutral-400">Total Expenses Logged</span>
              <div className="text-lg font-mono font-bold text-black font-semibold">₹{totalExpenseValuation.toLocaleString()}</div>
            </div>
            {!showForm && (
              <button 
                onClick={() => { clearForm(); setEditingId(null); setShowForm(true); }}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-900 text-xs font-semibold rounded uppercase tracking-wider flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Expense Row
              </button>
            )}
          </div>

          {showForm && (
            <form onSubmit={handleSave} className="border border-black bg-white p-4 rounded space-y-4">
              <h4 className="text-xs font-bold uppercase border-b border-neutral-100 pb-2">
                {editingId ? "Update Expense Item" : "New Expense Details"}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Date</label>
                  <input 
                    type="date" 
                    required 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs text-black bg-white focus:outline-none focus:border-black" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Description</label>
                  <select 
                    required 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs text-black bg-white focus:outline-none focus:border-black font-semibold"
                  >
                    {descriptionOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {description === "Others" && (
                    <input 
                      type="text" 
                      required 
                      placeholder="Specify other description" 
                      value={customDescription} 
                      onChange={(e) => setCustomDescription(e.target.value)} 
                      className="w-full mt-2 px-3 py-1.5 border border-neutral-200 rounded text-xs text-black bg-white focus:outline-none focus:border-black font-semibold" 
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Amount (₹)</label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    placeholder="e.g. 5000" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} 
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs font-mono text-black bg-white focus:outline-none focus:border-black font-semibold" 
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-neutral-50 pt-3">
                <button type="button" onClick={clearForm} className="px-3 py-1 border border-neutral-200 text-xs rounded font-semibold text-neutral-700 bg-white hover:bg-neutral-50">Clear</button>
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-3 py-1 border border-neutral-200 text-xs rounded font-semibold text-neutral-700 bg-white hover:bg-neutral-50">Cancel</button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-3 py-1 bg-black text-white text-xs rounded hover:bg-neutral-900 font-semibold disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : (editingId ? "Update" : "Save")}
                </button>
              </div>
            </form>
          )}

          {/* Table */}
          <div className="border border-neutral-200 bg-white rounded overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-400">
                  <th className="p-3">Date</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-neutral-50/50">
                    <td className="p-3 font-mono font-medium text-black">
                      {formatDate(exp.date)}
                    </td>
                    <td className="p-3 font-semibold text-neutral-800">{exp.description}</td>
                    <td className="p-3 text-right font-mono font-bold text-black border-l border-neutral-50">
                      ₹{exp.amount.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleEdit(exp)} className="p-1 hover:bg-neutral-100 rounded text-neutral-600">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(exp.id)} className="p-1 hover:bg-neutral-150 rounded text-neutral-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length > 0 && (
                  <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                    <td className="p-3"></td>
                    <td className="p-3 text-left">TOTAL EXPENSE</td>
                    <td className="p-3 text-right font-mono text-black border-l border-neutral-200 font-semibold">
                      ₹{totalExpenseValuation.toLocaleString()}
                    </td>
                    <td className="p-3"></td>
                  </tr>
                )}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-neutral-400">No expenses logged for this work entry.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MODULE 12 – PROFIT CALCULATION
// ==========================================
export function ProfitCalculationView({
  entries,
  privateWorks = [],
  cementLoads = [],
  tarLoads = [],
  expenses = [],
  onNavigate
}: {
  entries: Entry[];
  privateWorks?: PrivateWork[];
  cementLoads: CementLoad[];
  tarLoads: TarLoad[];
  expenses: Expense[];
  onNavigate: (tab: string) => void;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Combine works for dropdown selection
  const allWorks = [
    ...entries.map(e => ({ id: e.id, name: e.workName, type: 'entry' as const, original: e })),
    ...(privateWorks || []).map(p => ({ id: p.id, name: p.workName, type: 'private' as const, original: p }))
  ];

  // Search filter
  const filteredWorks = allWorks.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedWork = allWorks.find(w => w.id === selectedEntryId);

  // Calculations
  let agreedAmount = 0;
  let gstApplicable = true;
  let gstAmount = 0;
  let agreedAmountWithGST = 0;
  let materialsCost = 0;
  let executionExpense = 0;
  let totalExpense = 0;
  let totalExpenseWithGST = 0;
  let overallProfit = 0;
  let profitPercentage = 0;

  if (selectedWork) {
    agreedAmount = selectedWork.type === 'entry' 
      ? selectedWork.original.amount 
      : selectedWork.original.approxFinalWorkAmount;
    gstApplicable = selectedWork.original.gstApplicable !== false;
    
    // Calculate materials cost from Cement Loads & Tar Loads
    const cementCost = cementLoads
      .filter(cl => cl.workId === selectedWork.id)
      .reduce((sum, cl) => sum + cl.amountPerLoad, 0);

    const tarCost = tarLoads
      .filter(tl => tl.workId === selectedWork.id)
      .reduce((sum, tl) => sum + tl.amountPerLoad, 0);

    materialsCost = cementCost + tarCost;

    // Calculate execution expenses
    executionExpense = expenses
      .filter(exp => exp.workId === selectedWork.id)
      .reduce((sum, exp) => sum + exp.amount, 0);

    // Formulas
    const gstPercentage = gstApplicable ? 18 : 0;
    gstAmount = agreedAmount * (gstPercentage / 100);
    agreedAmountWithGST = agreedAmount + gstAmount;

    totalExpense = materialsCost + executionExpense;
    totalExpenseWithGST = totalExpense + (totalExpense * 0.18);

    overallProfit = agreedAmountWithGST - totalExpenseWithGST;
    profitPercentage = agreedAmountWithGST > 0 ? (overallProfit / agreedAmountWithGST) * 100 : 0;
  }

  const handleExcelExport = () => {
    if (!selectedWork) return;
    const reportData = [
      { Parameter: "Work Name", Value: selectedWork.name },
      { Parameter: "Agreed Amount", Value: `₹${agreedAmount.toLocaleString()}` },
      { Parameter: "GST (18%)", Value: `₹${gstAmount.toLocaleString()}` },
      { Parameter: "Agreed Amount with GST", Value: `₹${agreedAmountWithGST.toLocaleString()}` },
      { Parameter: "Materials Cost", Value: `₹${materialsCost.toLocaleString()}` },
      { Parameter: "Expense During Execution", Value: `₹${executionExpense.toLocaleString()}` },
      { Parameter: "Total Expense", Value: `₹${totalExpense.toLocaleString()}` },
      { Parameter: "Total Expense Including GST", Value: `₹${totalExpenseWithGST.toLocaleString()}` },
      { Parameter: "Profit Percentage", Value: `${Math.round(profitPercentage * 100) / 100}%` },
      { Parameter: "OVERALL PROFIT", Value: `₹${overallProfit.toLocaleString()}` }
    ];
    
    // Create Excel-compatible CSV output
    const csvContent = "data:text/csv;charset=utf-8," 
      + "BuildCorp ERP - Profit Calculation Report\n"
      + `Generated: ${new Date().toLocaleDateString()}\n\n`
      + "Parameter,Value\n"
      + reportData.map(r => `"${r.Parameter}","${r.Value}"`).join("\n");
      
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `profit_calculation_${selectedWork.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto animate-fade-in text-black print:p-0">
      <div className="print:hidden">
        <h2 className="text-xl font-bold tracking-tight uppercase">Profit Calculation</h2>
        <p className="text-xs text-neutral-500 font-medium">Auto-calculated project profitability register synced with Materials & Expenses.</p>
      </div>

      {/* Select Work */}
      <div className="border border-neutral-200 bg-white p-5 rounded space-y-4 print:hidden">
        <div>
          <label className="block text-[10px] font-bold uppercase text-neutral-500 mb-1.5">Search & Select Work</label>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input 
              type="text" 
              placeholder="Search work by name..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
            />
          </div>
          <select 
            value={selectedEntryId} 
            onChange={(e) => setSelectedEntryId(e.target.value)}
            className="w-full px-3 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-black font-semibold text-black bg-white"
          >
            <option value="">-- [ Search Work ▼ ] --</option>
            {filteredWorks.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}{w.type === 'private' ? " (Private)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Profit Calculation Screen Sheet */}
      {selectedWork ? (
        <div className="border border-black bg-white rounded p-6 shadow-xs space-y-6 print:border-none print:p-0">
          <div className="text-center border-b border-black pb-4">
            <h3 className="text-md font-bold uppercase tracking-widest font-mono">ARAVIND ASSOCIATES</h3>
            <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-mono mt-0.5">Project Financial Statement</p>
          </div>

          <div className="space-y-4 text-xs font-mono">
            {/* Work Name */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Work Name</span>
              <span className="font-semibold text-black text-right max-w-xs">{selectedWork.name}</span>
            </div>

            {/* Work Status */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Work Status</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                selectedWork.type === 'entry' && selectedWork.original.status === 'Completed' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : selectedWork.type === 'private'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              }`}>
                {selectedWork.type === 'entry' ? selectedWork.original.status : 'Ongoing (Private)'}
              </span>
            </div>

            {/* Agreed Amount */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Agreed Amount</span>
              <span className="font-bold text-black">₹{agreedAmount.toLocaleString()}</span>
            </div>

            {/* GST (18%) */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">GST (18%)</span>
              <span className="font-bold text-neutral-600">₹{gstAmount.toLocaleString()}</span>
            </div>

            {/* Agreed Amount with GST */}
            <div className="flex justify-between border-b border-neutral-200 pb-2">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Agreed Amount with GST</span>
              <span className="font-bold text-black text-sm">₹{agreedAmountWithGST.toLocaleString()}</span>
            </div>

            {/* Materials Cost */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5 pt-2">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Materials Cost</span>
              <span className="font-bold text-neutral-600">₹{materialsCost.toLocaleString()}</span>
            </div>

            {/* Expense During Execution */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Expense During Execution</span>
              <span className="font-bold text-neutral-600">₹{executionExpense.toLocaleString()}</span>
            </div>

            {/* Total Expense */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5 pt-2">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Total Expense</span>
              <span className="font-bold text-black">₹{totalExpense.toLocaleString()}</span>
            </div>

            {/* Total Expense Including GST */}
            <div className="flex justify-between border-b border-neutral-200 pb-2">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Total Expense Including GST</span>
              <span className="font-bold text-black">₹{totalExpenseWithGST.toLocaleString()}</span>
            </div>

            {/* Profit Percentage */}
            <div className="flex justify-between border-b border-neutral-100 pb-1.5 pt-2">
              <span className="text-neutral-500 uppercase font-bold text-[9px]">Profit Percentage</span>
              <span className={`font-bold ${profitPercentage >= 0 ? 'text-black' : 'text-red-600'}`}>
                {Math.round(profitPercentage * 100) / 100}%
              </span>
            </div>

            {/* OVERALL PROFIT */}
            <div className="flex justify-between border border-black p-4 bg-neutral-50 rounded">
              <span className="text-black uppercase font-bold text-[10px] self-center">OVERALL PROFIT</span>
              <span className={`font-mono text-lg font-bold ${overallProfit >= 0 ? 'text-black font-extrabold' : 'text-red-600'}`}>
                ₹{overallProfit.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between gap-3 pt-4 border-t border-neutral-100 print:hidden">
            <button 
              type="button" 
              onClick={() => onNavigate("dashboard")}
              className="px-4 py-1.5 border border-neutral-200 text-xs rounded font-semibold text-neutral-700 bg-white hover:bg-neutral-50 cursor-pointer"
            >
              Back
            </button>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={handleExcelExport}
                className="px-4 py-1.5 border border-neutral-300 text-xs rounded font-semibold text-neutral-700 bg-white hover:bg-neutral-50 cursor-pointer"
              >
                Excel
              </button>
              <button 
                type="button" 
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-black hover:bg-neutral-900 text-white text-xs rounded font-semibold cursor-pointer"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-neutral-200 bg-white p-8 rounded text-center text-neutral-400 font-semibold text-xs">
          Please select a contract or private work from the dropdown to calculate profitability.
        </div>
      )}
    </div>
  );
}


