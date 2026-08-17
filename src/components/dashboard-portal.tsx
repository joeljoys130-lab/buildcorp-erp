"use client";

import { useState } from "react";
import { 
  Building2, Layers, Package, Fuel, Award, FileText, CheckSquare, 
  PlusCircle, BookOpen, Warehouse, Compass, Menu, X, LogOut,
  Receipt, TrendingUp
} from "lucide-react";
import { useRouter } from "next/navigation";
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
  ProfitCalculationView
} from "./views/modules";
import type { CementLoad } from "@/lib/types";

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

  // Targeted refresh — only re-fetches cement loads (fast, ~1 query)
  const refreshCementLoads = async () => {
    try {
      const data = await getCementLoadsAction();
      setCementLoads(data || []);
    } catch (e) {
      console.error("Failed to refresh cement loads", e);
    }
  };

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: Building2 },
    { id: "cement-load", label: "Cement Load Updation", icon: Package },
    { id: "entry", label: "Entry", icon: FileText },
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

          <div className="flex items-center gap-4">
            {loading && (
              <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 animate-pulse">
                Syncing database...
              </span>
            )}
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
              onOptimisticUpdate={(updated) =>
                setCementLoads((prev) => {
                  const idx = prev.findIndex((c) => c.id === updated.id);
                  if (idx === -1) {
                    // New record (create path): prepend to parent state
                    return [updated, ...prev];
                  }
                  // Existing record (edit path): update in-place
                  return prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c);
                })
              }
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "entry" && (
            <EntryView 
              entries={entries} 
              onRefresh={refreshAllStates}
              onCreateEntry={createEntryAction}
              onUpdateEntry={updateEntryAction}
              onDeleteEntry={deleteEntryAction}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "stock-register" && (
            <StockRegisterView 
              stockItems={stockRegister}
              onRefresh={refreshAllStates}
              onUpdateStockItem={updateStockRegisterItemAction}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "materials-used" && (
            <MaterialsUsedView 
              entries={entries}
              privateWorks={privateWorks}
              siteMaterials={siteMaterials} 
              onRefresh={refreshAllStates}
              onCreateSiteMaterial={createSiteMaterialAction}
              onUpdateSiteMaterial={updateSiteMaterialAction}
              onDeleteSiteMaterial={deleteSiteMaterialAction}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "private-work" && (
            <PrivateWorkView 
              privateWorks={privateWorks} 
              onRefresh={refreshAllStates}
              onCreatePrivateWork={createPrivateWorkAction}
              onUpdatePrivateWork={updatePrivateWorkAction}
              onDeletePrivateWork={deletePrivateWorkAction}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "tar-load" && (
            <TarLoadView 
              tarLoads={tarLoads} 
              onRefresh={refreshAllStates}
              onCreateTarLoad={createTarLoadAction}
              onUpdateTarLoad={updateTarLoadAction}
              onDeleteTarLoad={deleteTarLoadAction}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === "work-based-entry" && (
            <WorkBasedEntryView 
              entries={entries} 
              privateWorks={privateWorks}
              workBasedEntries={workBasedEntries} 
              onRefresh={refreshAllStates}
              onCreateWorkBasedEntry={createWorkBasedEntryAction}
              onUpdateWorkBasedEntry={updateWorkBasedEntryAction}
              onDeleteWorkBasedEntry={deleteWorkBasedEntryAction}
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
              onRefresh={refreshAllStates}
              onUpdateEntry={updateEntryAction}
            />
          )}

          {activeTab === "expense-updation" && (
            <ExpenseUpdationView 
              entries={entries} 
              privateWorks={privateWorks}
              expenses={expenses}
              onRefresh={refreshAllStates}
              onCreateExpense={createExpenseAction}
              onUpdateExpense={updateExpenseAction}
              onDeleteExpense={deleteExpenseAction}
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
