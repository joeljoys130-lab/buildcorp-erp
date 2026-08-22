"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Building2, Layers, Package, Fuel, Award, FileText, CheckSquare,
  PlusCircle, BookOpen, Warehouse, Compass, Menu, X, LogOut,
  Receipt, TrendingUp, AlertCircle, Bell, BellRing
} from "lucide-react";
import { useRouter } from "next/navigation";
import { evaluateDlpStatus } from "@/lib/dlp-utils";
import {
  getNotificationPermissionState, subscribeUserToPush, unsubscribeUserFromPush, isPushSupported
} from "@/lib/push-client";
import {
  createCementLoadAction, updateCementLoadAction, deleteCementLoadAction,
  createEntryAction, updateEntryAction, deleteEntryAction,
  updateStockRegisterItemAction,
  createSiteMaterialAction, updateSiteMaterialAction, deleteSiteMaterialAction,
  createPrivateWorkAction, updatePrivateWorkAction, deletePrivateWorkAction,
  createTarLoadAction, updateTarLoadAction, deleteTarLoadAction,
  createWorkBasedEntryAction, updateWorkBasedEntryAction, deleteWorkBasedEntryAction,
  getCementLoadsAction, getEntriesAction, getStockRegisterAction,
  getSiteMaterialsAction, getPrivateWorksAction, getTarLoadsAction,
  getWorkBasedEntriesAction,
  createExpenseAction, updateExpenseAction, deleteExpenseAction, getExpensesAction,
  getDashboardDataAction
} from "@/app/actions";
import DashboardView from "./views/dashboard-view";
import {
  CementLoadView, EntryView, StockRegisterView, MaterialsUsedView,
  PrivateWorkView, TarLoadView, WorkBasedEntryView, WorkBasedRegisterView,
  OfficeWiseWorkView, WorkStatusUpdationView, ExpenseUpdationView,
  ProfitCalculationView, DlpNotificationsView
} from "./views/modules";
import type { CementLoad, Entry, StockRegisterItem, SiteMaterial, PrivateWork, TarLoad, WorkBasedEntry, Expense } from "@/lib/types";

interface DashboardPortalProps {
  initialUser: any;
  initialData: any;
}

export default function DashboardPortal({ initialUser, initialData }: DashboardPortalProps) {
  const [user] = useState(initialUser);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    router.push('/login');
  };

  // Modular Data States
  const [cementLoads, setCementLoads] = useState<CementLoad[]>(initialData.cementLoads || []);
  const [entries, setEntries] = useState(initialData.entries || []);
  const [stockRegister, setStockRegister] = useState(initialData.stockRegister || []);
  const [siteMaterials, setSiteMaterials] = useState(initialData.siteMaterials || []);
  const [privateWorks, setPrivateWorks] = useState(initialData.privateWorks || []);
  const [tarLoads, setTarLoads] = useState(initialData.tarLoads || []);
  const [workBasedEntries, setWorkBasedEntries] = useState(initialData.workBasedEntries || []);
  const [expenses, setExpenses] = useState(initialData.expenses || []);

  // Push Notification & In-App Alerts State
  const [pushState, setPushState] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);

  useEffect(() => {
    setPushState(getNotificationPermissionState());
  }, []);

  const handleTogglePush = async () => {
    if (isPushLoading) return;
    setIsPushLoading(true);

    if (pushState === 'granted') {
      const res = await unsubscribeUserFromPush();
      if (res.success) {
        setPushState(getNotificationPermissionState());
      }
    } else {
      const res = await subscribeUserToPush();
      if (res.success) {
        setPushState('granted');
      } else {
        setPushState(getNotificationPermissionState());
        if (res.error) alert(res.error);
      }
    }
    setIsPushLoading(false);
  };

  const dlpAlerts = useMemo(() => {
    return (entries as Entry[]).map(entry => ({
      entry,
      dlp: evaluateDlpStatus(entry)
    })).filter(item => item.dlp !== null && (item.dlp.isExpired || item.dlp.isExpiringSoon));
  }, [entries]);

  const refreshAllStates = async () => {
    setLoading(true);
    try {
      const data = await getDashboardDataAction();
      setCementLoads(data.cementLoads || []);
      setEntries(data.entries || []);
      setStockRegister(data.stockRegister || []);
      setSiteMaterials(data.siteMaterials || []);
      setPrivateWorks(data.privateWorks || []);
      setTarLoads(data.tarLoads || []);
      setWorkBasedEntries(data.workBasedEntries || []);
      setExpenses(data.expenses || []);
    } catch (e) {
      console.error("Failed to refresh dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  // Targeted refreshes — individual fast queries instead of heavy getDashboardDataAction
  const refreshCementLoads = async () => {
    try {
      const data = await getCementLoadsAction();
      if (data) setCementLoads(data);
    } catch (e) {
      console.error("Failed to refresh cement loads", e);
    }
  };

  const refreshEntries = async () => {
    try {
      const data = await getEntriesAction();
      if (data) setEntries(data);
    } catch (e) {
      console.error("Failed to refresh entries", e);
    }
  };

  const refreshStockRegister = async () => {
    try {
      const data = await getStockRegisterAction();
      if (data) setStockRegister(data);
    } catch (e) {
      console.error("Failed to refresh stock register", e);
    }
  };

  const refreshSiteMaterials = async () => {
    try {
      const data = await getSiteMaterialsAction();
      if (data) setSiteMaterials(data);
    } catch (e) {
      console.error("Failed to refresh site materials", e);
    }
  };

  const refreshPrivateWorks = async () => {
    try {
      const data = await getPrivateWorksAction();
      if (data) setPrivateWorks(data);
    } catch (e) {
      console.error("Failed to refresh private works", e);
    }
  };

  const refreshTarLoads = async () => {
    try {
      const data = await getTarLoadsAction();
      if (data) setTarLoads(data);
    } catch (e) {
      console.error("Failed to refresh tar loads", e);
    }
  };

  const refreshWorkBasedEntries = async () => {
    try {
      const data = await getWorkBasedEntriesAction();
      if (data) setWorkBasedEntries(data);
    } catch (e) {
      console.error("Failed to refresh work based entries", e);
    }
  };

  const refreshExpenses = async () => {
    try {
      const data = await getExpensesAction();
      if (data) setExpenses(data);
    } catch (e) {
      console.error("Failed to refresh expenses", e);
    }
  };

  // Optimistic Handlers
  const optimisticUpdateCementLoad = (updated: any) => {
    setCementLoads((prev: CementLoad[]) => {
      const idx = prev.findIndex((c: CementLoad) => c.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((c: CementLoad) => (c.id === updated.id ? { ...c, ...updated } : c));
    });
  };
  const optimisticDeleteCementLoad = (id: string) => {
    setCementLoads((prev: CementLoad[]) => prev.filter((c: CementLoad) => c.id !== id));
  };

  const optimisticUpdateEntry = (updated: any) => {
    setEntries((prev: Entry[]) => {
      const idx = prev.findIndex((e: Entry) => e.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((e: Entry) => (e.id === updated.id ? { ...e, ...updated } : e));
    });
  };
  const optimisticDeleteEntry = (id: string) => {
    setEntries((prev: Entry[]) => prev.filter((e: Entry) => e.id !== id));
  };

  const optimisticUpdateStockItem = (updated: any) => {
    setStockRegister((prev: StockRegisterItem[]) =>
      prev.map((s: StockRegisterItem) => (s.id === updated.id ? { ...s, ...updated } : s))
    );
  };

  const optimisticUpdateSiteMaterial = (updated: any) => {
    setSiteMaterials((prev: SiteMaterial[]) => {
      const idx = prev.findIndex((m: SiteMaterial) => m.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((m: SiteMaterial) => (m.id === updated.id ? { ...m, ...updated } : m));
    });
  };
  const optimisticDeleteSiteMaterial = (id: string) => {
    setSiteMaterials((prev: SiteMaterial[]) => prev.filter((m: SiteMaterial) => m.id !== id));
  };

  const optimisticUpdatePrivateWork = (updated: any) => {
    setPrivateWorks((prev: PrivateWork[]) => {
      const idx = prev.findIndex((pw: PrivateWork) => pw.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((pw: PrivateWork) => (pw.id === updated.id ? { ...pw, ...updated } : pw));
    });
  };
  const optimisticDeletePrivateWork = (id: string) => {
    setPrivateWorks((prev: PrivateWork[]) => prev.filter((pw: PrivateWork) => pw.id !== id));
  };

  const optimisticUpdateTarLoad = (updated: any) => {
    setTarLoads((prev: TarLoad[]) => {
      const idx = prev.findIndex((t: TarLoad) => t.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((t: TarLoad) => (t.id === updated.id ? { ...t, ...updated } : t));
    });
  };
  const optimisticDeleteTarLoad = (id: string) => {
    setTarLoads((prev: TarLoad[]) => prev.filter((t: TarLoad) => t.id !== id));
  };

  const optimisticUpdateWorkBasedEntry = (updated: any) => {
    setWorkBasedEntries((prev: WorkBasedEntry[]) => {
      const idx = prev.findIndex((w: WorkBasedEntry) => w.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((w: WorkBasedEntry) => (w.id === updated.id ? { ...w, ...updated } : w));
    });
  };
  const optimisticDeleteWorkBasedEntry = (id: string) => {
    setWorkBasedEntries((prev: WorkBasedEntry[]) => prev.filter((w: WorkBasedEntry) => w.id !== id));
  };

  const optimisticUpdateExpense = (updated: any) => {
    setExpenses((prev: Expense[]) => {
      const idx = prev.findIndex((ex: Expense) => ex.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      return prev.map((ex: Expense) => (ex.id === updated.id ? { ...ex, ...updated } : ex));
    });
  };
  const optimisticDeleteExpense = (id: string) => {
    setExpenses((prev: Expense[]) => prev.filter((ex: Expense) => ex.id !== id));
  };

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: Building2 },
    { id: "cement-load", label: "Cement Load Updation", icon: Package },
    { id: "entry", label: "Entry", icon: FileText },
    { id: "dlp-notifications", label: "DLP Notifications", icon: AlertCircle },
    { id: "stock-register", label: "Stock Register", icon: Warehouse },
    { id: "materials-used", label: "Total Materials Used In Site", icon: Compass },
    { id: "private-work", label: "Private Work Status", icon: Award },
    { id: "tar-load", label: "Tar Load Updation", icon: Fuel },
    { id: "work-based-entry", label: "Work Based Entry", icon: PlusCircle },
    { id: "work-based-register", label: "Work Based Register", icon: BookOpen },
    { id: "office-wise-work", label: "Office Wise Work List", icon: Layers },
    { id: "work-status-updation", label: "Work Status Updation", icon: CheckSquare },
    { id: "expense-updation", label: "Expense Updation", icon: Receipt },
    { id: "profit-calculation", label: "Profit Calculation", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen flex bg-white text-black font-sans selection:bg-neutral-200">

      {/* 1. SIDEBAR (DESKTOP) — hidden during print */}
      <aside className="hidden lg:flex print:hidden flex-col w-64 border-r border-neutral-200 bg-black text-white shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-neutral-800 bg-black">
          <div className="w-6 h-6 border border-white flex items-center justify-center font-bold text-xs">
            A
          </div>
          <span className="font-bold text-xs tracking-widest uppercase">
            Aravind Associates
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-4">
                  <ul className="space-y-2 list-none pl-0 ml-0">
          {navigationItems.map(item => (
            <li key={item.id}>
              <a href="#" className={`block w-full text-left px-3 py-2 rounded text-xs font-semibold tracking-wide transition-colors ${activeTab === item.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}`} onClick={(e) => { e.preventDefault(); setActiveTab(item.id); }}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      </aside>

      {/* 2. SIDEBAR DRAWER (MOBILE) — hidden during print */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden flex bg-black/60 backdrop-blur-xs">
          <aside className="w-64 bg-black text-white flex flex-col h-full border-r border-neutral-800">
            <div className="h-16 flex items-center justify-between px-6 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider">BuildCorp</span>
              </div>
              <button onClick={() => setSidebarOpen(false)}>
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>

            <ul className="space-y-2 list-none pl-0 ml-0">
              {navigationItems.map(item => (
                <li key={item.id}>
                  <a href="#" className={`block w-full text-left px-3 py-2 rounded text-xs font-semibold tracking-wide transition-colors ${activeTab === item.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}`} onClick={(e) => { e.preventDefault(); setActiveTab(item.id); setSidebarOpen(false); }}>{item.label}</a>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {/* 3. MAIN CONTENT CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top Navbar — hidden during print */}
        <header className="print:hidden h-16 border-b border-neutral-200 bg-white flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 hover:bg-neutral-100 rounded text-neutral-600 lg:hidden cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {loading && (
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 animate-pulse hidden md:inline">
                Syncing database...
              </span>
            )}

            {/* Web Push Notification Control */}
            {pushState === 'granted' ? (
              <button
                onClick={handleTogglePush}
                disabled={isPushLoading}
                title="Click to disable Web Push notifications"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Notifications Enabled</span>
              </button>
            ) : pushState === 'denied' ? (
              <span
                title="Browser notifications are blocked. Enable them in browser site settings."
                className="hidden sm:inline-block text-[10px] font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-1 border border-neutral-200 rounded"
              >
                Notifications Blocked
              </span>
            ) : (
              <button
                onClick={handleTogglePush}
                disabled={isPushLoading}
                title="Click to allow BuildCorp ERP to send Web Push notifications"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-black hover:bg-neutral-800 border border-black rounded transition-all cursor-pointer animate-pulse"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>{isPushLoading ? "Enabling..." : "Enable Notifications"}</span>
              </button>
            )}

            {/* In-App Bell Notification Indicator */}
            <div className="relative">
              <button
                onClick={() => setShowNotificationMenu(prev => !prev)}
                title="View in-app DLP notifications"
                className="p-2 border border-neutral-200 hover:bg-neutral-100 rounded text-neutral-700 relative cursor-pointer bg-white flex items-center justify-center"
              >
                <Bell className="w-4 h-4" />
                {dlpAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white font-mono text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                    {dlpAlerts.length}
                  </span>
                )}
              </button>

              {/* In-App Notification Dropdown Popover */}
              {showNotificationMenu && (
                <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-neutral-300 rounded shadow-xl z-50 p-4 space-y-3 text-left">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-black" />
                      DLP Alerts ({dlpAlerts.length})
                    </span>
                    <button
                      onClick={() => setShowNotificationMenu(false)}
                      className="text-neutral-400 hover:text-black p-1 text-xs cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {dlpAlerts.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-4 text-center font-medium">No active DLP alerts.</p>
                    ) : (
                      dlpAlerts.map(({ entry, dlp }: { entry: Entry; dlp: any }) => (
                        <div
                          key={entry.id}
                          onClick={() => {
                            setActiveTab("dlp-notifications");
                            setShowNotificationMenu(false);
                          }}
                          className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                            dlp!.isExpired ? 'border-red-300 bg-red-50/50 hover:bg-red-100/50' : 'border-yellow-300 bg-yellow-50/50 hover:bg-yellow-100/50'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-black text-xs truncate max-w-[170px]">{entry.workName}</span>
                            <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                              dlp!.isExpired ? 'bg-red-600 text-white' : 'bg-yellow-500 text-white'
                            }`}>
                              {dlp!.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-neutral-600">
                            {dlp!.isExpired
                              ? `Expired on ${new Date(dlp!.dlpExpiryDate).toLocaleDateString('en-IN')}`
                              : `Expires on ${new Date(dlp!.dlpExpiryDate).toLocaleDateString('en-IN')} (${dlp!.daysRemaining} days left)`}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-100 flex justify-between items-center text-[10px]">
                    <span className="text-neutral-500 font-medium">Web Push Active</span>
                    <button
                      onClick={() => {
                        setActiveTab("dlp-notifications");
                        setShowNotificationMenu(false);
                      }}
                      className="font-bold text-black hover:underline uppercase cursor-pointer"
                    >
                      View All Notifications &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User info */}
            <span className="hidden md:block text-xs text-neutral-500 font-medium">
              {user?.email ?? user?.name ?? 'User'}
            </span>
            {/* Logout button */}
            <button
              onClick={handleLogout}
              title="Logout"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Dynamic Inner Tab View */}
        <main className="flex-1 p-6 overflow-y-auto relative bg-neutral-50 print:p-0 print:bg-white print:overflow-visible">

          {activeTab === "dashboard" && (
            <DashboardView
              data={{
                entries,
                cementLoads,
                tarLoads,
                stockRegister,
                siteMaterials,
                workBasedEntries,
                privateWorks,
                expenses
              }}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "cement-load" && (
            <CementLoadView
              cementLoads={cementLoads}
              onRefresh={refreshCementLoads}
              onCreateCementLoad={createCementLoadAction}
              onUpdateCementLoad={updateCementLoadAction}
              onDeleteCementLoad={deleteCementLoadAction}
              onOptimisticUpdate={optimisticUpdateCementLoad}
              onOptimisticDelete={optimisticDeleteCementLoad}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "entry" && (
            <EntryView
              entries={entries}
              onRefresh={refreshEntries}
              onCreateEntry={createEntryAction}
              onUpdateEntry={updateEntryAction}
              onDeleteEntry={deleteEntryAction}
              onOptimisticUpdate={optimisticUpdateEntry}
              onOptimisticDelete={optimisticDeleteEntry}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "dlp-notifications" && (
            <DlpNotificationsView
              entries={entries}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "stock-register" && (
            <StockRegisterView
              stockItems={stockRegister}
              onRefresh={refreshStockRegister}
              onUpdateStockItem={updateStockRegisterItemAction}
              onOptimisticUpdate={optimisticUpdateStockItem}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "materials-used" && (
            <MaterialsUsedView
              entries={entries}
              privateWorks={privateWorks}
              siteMaterials={siteMaterials}
              onRefresh={refreshSiteMaterials}
              onCreateSiteMaterial={createSiteMaterialAction}
              onUpdateSiteMaterial={updateSiteMaterialAction}
              onDeleteSiteMaterial={deleteSiteMaterialAction}
              onOptimisticUpdate={optimisticUpdateSiteMaterial}
              onOptimisticDelete={optimisticDeleteSiteMaterial}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "private-work" && (
            <PrivateWorkView
              privateWorks={privateWorks}
              onRefresh={refreshPrivateWorks}
              onCreatePrivateWork={createPrivateWorkAction}
              onUpdatePrivateWork={updatePrivateWorkAction}
              onDeletePrivateWork={deletePrivateWorkAction}
              onOptimisticUpdate={optimisticUpdatePrivateWork}
              onOptimisticDelete={optimisticDeletePrivateWork}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "tar-load" && (
            <TarLoadView
              tarLoads={tarLoads}
              onRefresh={refreshTarLoads}
              onCreateTarLoad={createTarLoadAction}
              onUpdateTarLoad={updateTarLoadAction}
              onDeleteTarLoad={deleteTarLoadAction}
              onOptimisticUpdate={optimisticUpdateTarLoad}
              onOptimisticDelete={optimisticDeleteTarLoad}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "work-based-entry" && (
            <WorkBasedEntryView
              entries={entries}
              privateWorks={privateWorks}
              workBasedEntries={workBasedEntries}
              onRefresh={refreshWorkBasedEntries}
              onCreateWorkBasedEntry={createWorkBasedEntryAction}
              onUpdateWorkBasedEntry={updateWorkBasedEntryAction}
              onDeleteWorkBasedEntry={deleteWorkBasedEntryAction}
              onOptimisticUpdate={optimisticUpdateWorkBasedEntry}
              onOptimisticDelete={optimisticDeleteWorkBasedEntry}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "work-based-register" && (
            <WorkBasedRegisterView
              entries={entries}
              privateWorks={privateWorks}
              workBasedEntries={workBasedEntries}
              expenses={expenses}
            />
          )}

          {activeTab === "office-wise-work" && (
            <OfficeWiseWorkView
              entries={entries}
            />
          )}

          {activeTab === "work-status-updation" && (
            <WorkStatusUpdationView
              entries={entries}
              onRefresh={refreshEntries}
              onUpdateEntry={updateEntryAction}
              onOptimisticUpdate={optimisticUpdateEntry}
            />
          )}

          {activeTab === "expense-updation" && (
            <ExpenseUpdationView
              entries={entries}
              privateWorks={privateWorks}
              expenses={expenses}
              onRefresh={refreshExpenses}
              onCreateExpense={createExpenseAction}
              onUpdateExpense={updateExpenseAction}
              onDeleteExpense={deleteExpenseAction}
              onOptimisticUpdate={optimisticUpdateExpense}
              onOptimisticDelete={optimisticDeleteExpense}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "profit-calculation" && (
            <ProfitCalculationView
              entries={entries}
              privateWorks={privateWorks}
              cementLoads={cementLoads}
              tarLoads={tarLoads}
              expenses={expenses}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "profit-calculation" && (
            <ProfitCalculationView
              entries={entries}
              privateWorks={privateWorks}
              cementLoads={cementLoads}
              tarLoads={tarLoads}
              expenses={expenses}
              onNavigate={setActiveTab}
            />
          )}

        </main>
      </div>
    </div>
  );
}
