"use client";

import { useState } from "react";
import {
  Building2, Layers, Package, Fuel, TrendingUp, Calendar, ArrowRight,
  Award, FileText, CheckSquare, PlusCircle, BookOpen, Warehouse, Compass, X, AlertCircle
} from "lucide-react";
import { CementLoad, Entry, StockRegisterItem, PrivateWork, TarLoad, WorkBasedEntry, Expense } from "@/lib/types";

import { evaluateDlpStatus } from "@/lib/dlp-utils";

interface DashboardViewProps {
  data: {
    entries: Entry[];
    cementLoads: CementLoad[];
    tarLoads: TarLoad[];
    stockRegister: StockRegisterItem[];
    siteMaterials: any[];
    workBasedEntries: WorkBasedEntry[];
    privateWorks: PrivateWork[];
    expenses?: Expense[];
  };
  onNavigate: (tab: string) => void;
}

export default function DashboardView({ data, onNavigate }: DashboardViewProps) {
  const {
    entries = [],
    cementLoads = [],
    tarLoads = [],
    stockRegister = [],
    privateWorks = [],
    expenses = []
  } = data;

  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const totalCementBags = cementLoads.reduce((sum, item) => sum + item.loadInBags, 0);
  const totalTarKg = tarLoads.reduce((sum, item) => sum + item.quantityInKg, 0);

  const ongoingContractsCount = entries.filter(e => e.status === 'Ongoing').length;
  const ongoingPrivateWorksCount = privateWorks.length; // Private works are all considered ongoing (no status field)
  const activeWorksCount = ongoingContractsCount + ongoingPrivateWorksCount;
  const completedWorksCount = entries.filter(e => e.status === 'Completed').length;
  const totalContractValuation = entries.reduce((sum, e) => sum + e.amount, 0);
  const privateWorksValuation = privateWorks.reduce((sum, p) => sum + p.approxFinalWorkAmount, 0);
  const totalWorksCount = entries.filter(e => e.status !== 'Completed').length + privateWorks.length;

  // Financial & Profitability calculations
  const portfolioValuation = totalContractValuation + privateWorksValuation;
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const contractPayments = entries.reduce((sum, e) => sum + (e.paymentReceived || 0), 0);
  const privatePayments = privateWorks.reduce((sum, p) => sum + (p.paymentReceived || 0), 0);
  const totalPaymentsReceived = contractPayments + privatePayments;
  const projectedProfit = portfolioValuation - totalExpenses;
  const realizedProfit = totalPaymentsReceived - totalExpenses;

  // Compute upcoming work completion alerts & DLP alerts
  const now = new Date();
  const alerts: any[] = [];

  // DLP Alerts (Authoritative Rule: Actual Completion + DLP Period)
  entries.forEach(entry => {
    const dlp = evaluateDlpStatus(entry);
    if (dlp && dlp.isExpired) {
      alerts.push({
        id: `dlp-exp-${entry.id}`,
        type: 'important',
        targetTab: 'dlp-notifications',
        message: `DLP Period Expired: "${entry.workName}" crossed DLP on ${dlp.dlpExpiryDate.toISOString().substring(0, 10)}. Click to view.`
      });
    } else if (dlp && dlp.isExpiringSoon) {
      alerts.push({
        id: `dlp-soon-${entry.id}`,
        type: 'warning',
        targetTab: 'dlp-notifications',
        message: `DLP Expiring Soon: "${entry.workName}" expires on ${dlp.dlpExpiryDate.toISOString().substring(0, 10)} (${dlp.daysRemaining} days left).`
      });
    }
  });

  // Upcoming Work Completion Alerts
  entries.forEach(entry => {
    if (!entry.workCompletionDateAsPerAgreement) return;
    const compDate = new Date(entry.workCompletionDateAsPerAgreement);
    if (isNaN(compDate.getTime())) return;
    const diffMs = compDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 2 && diffDays >= 0) {
      alerts.push({ id: `comp-${entry.id}`, type: 'important', targetTab: 'entry', message: `Work "${entry.workName}" completes in ${diffDays} day(s) – IMPORTANT!` });
    } else if (diffDays <= 3 && diffDays > 2) {
      alerts.push({ id: `comp-${entry.id}`, type: 'warning', targetTab: 'entry', message: `Work "${entry.workName}" completes in ${diffDays} days.` });
    } else if (diffDays <= 7 && diffDays > 3) {
      alerts.push({ id: `comp-${entry.id}`, type: 'info', targetTab: 'entry', message: `Work "${entry.workName}" completes in ${diffDays} days.` });
    }
  });

  const stats = [
    { label: "Active Works", value: activeWorksCount, desc: "Ongoing contracts + private works" },
    { label: "Contract Value", value: `₹${(totalContractValuation / 100000).toFixed(1)} L`, desc: "Total value of agreements" },
    { label: "Cement Stocked", value: `${totalCementBags} Bags`, desc: "Total purchased cement bags" },
    { label: "Tar Aggregate", value: `${(totalTarKg / 1000).toFixed(1)} Tons`, desc: "Bitumen emulsion aggregate" },
    { label: "Total Works", value: totalWorksCount, desc: "All active works (excludes completed)" },
    { label: "Works Completed", value: completedWorksCount, desc: "Completed works count" },
  ];

  const modules = [
    { id: "cement-load", label: "Cement Load Updation", icon: Package, desc: "Record cement purchase bills, load bags, and monitor remaining balances." },
    { id: "entry", label: "Contract Entry", icon: FileText, desc: "Register government contracts, SLA timelines, stamp papers, and performance guarantees." },
    { id: "dlp-notifications", label: "DLP Notifications", icon: AlertCircle, desc: "Monitor works whose Defect Liability Period has expired based on Actual Completion." },
    { id: "stock-register", label: "Stock Register", icon: Warehouse, desc: "Real-time stock ledger of Cement, RS1, SS1, and VG30 Bitumen aggregates." },
    { id: "materials-used", label: "Materials Used in Site", icon: Compass, desc: "Map and reconcile estimated deliverables against stock delivered to construction sites." },
    { id: "private-work", label: "Private Work Status / Entry", icon: Award, desc: "Log private non-tender civil jobs, advance amounts, site visits, and final payments." },
    { id: "tar-load", label: "Tar Load Updation", icon: Fuel, desc: "Track incoming Bitumen tankers, addressed office targets, and paid balances." },
    { id: "work-based-entry", label: "Work Based Entry", icon: PlusCircle, desc: "Build detailed bill-of-quantities (BOQ) line items and sub-item descriptions." },
    { id: "work-based-register", label: "Work Based Register", icon: BookOpen, desc: "Consolidated filter register of contract executions, payment logs, and item details." },
    { id: "office-wise-work", label: "Office Wise Work List", icon: Building2, desc: "Group and display ongoing construction projects by PWD or NHAI regional offices." },
    { id: "work-status-updation", label: "Work Status / Updation", icon: CheckSquare, desc: "Update contract execution parameters, timeline details, and progress status." },
  ];

  // Render alerts UI
  const renderAlert = (alert: any) => {
    const baseStyle = "p-3 rounded mb-2 text-sm font-medium cursor-pointer transition-opacity hover:opacity-90 flex items-center justify-between";
    let style = "bg-blue-100 text-blue-800"; // info
    if (alert.type === 'warning') style = "bg-yellow-100 text-yellow-800 border border-yellow-300";
    if (alert.type === 'important') style = "bg-red-100 text-red-800 border border-red-400 font-bold animate-pulse";
    return (
      <div
        key={alert.id}
        onClick={() => onNavigate(alert.targetTab || "entry")}
        className={`${baseStyle} ${style}`}
      >
        <span>🚨 {alert.message}</span>
        <span className="text-xs underline font-semibold ml-2">View &rarr;</span>
      </div>
    );
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-IN').format(num);
  };

  const getWorkName = (workId: string) => {
    const entry = entries.find(e => e.id === workId);
    if (entry) return `${entry.workName} (Govt)`;
    const pw = privateWorks.find(p => p.id === workId);
    if (pw) return `${pw.workName} (Private)`;
    return "General / Unlinked";
  };

  return (
    <div className="space-y-8 animate-fade-in text-black">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight uppercase">BuildCorp Control Center</h1>
        <p className="text-xs text-neutral-500 font-medium mt-1">Monochromatic management portal for Construction ERP modules.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div
            key={i}
            onClick={() => setSelectedKpi(stat.label)}
            className="border border-neutral-200 bg-white p-5 rounded cursor-pointer hover:border-black transition-colors"
          >
            <div className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">{stat.label}</div>
            <div className="text-2xl font-mono font-bold mt-1.5">{stat.value}</div>
            <div className="text-[10px] text-neutral-500 mt-1">{stat.desc}</div>
          </div>
        ))}
      </div>

      {/* Portfolio Profitability & Financial Health */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 pb-2 border-b border-neutral-100">
          Portfolio Profitability & Financial Health
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div
            onClick={() => setSelectedKpi("Total Portfolio Valuation")}
            className="border border-neutral-200 bg-white p-5 rounded flex flex-col justify-between cursor-pointer hover:border-black transition-colors"
          >
            <div>
              <div className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Total Portfolio Valuation</div>
              <div className="text-xl font-mono font-bold mt-1.5 text-black">₹{formatNumber(portfolioValuation)}</div>
            </div>
            <div className="text-[10px] text-neutral-500 mt-2 border-t border-neutral-100 pt-2 flex justify-between">
              <span>Govt Contracts: ₹{formatNumber(totalContractValuation)}</span>
              <span>Private: ₹{formatNumber(privateWorksValuation)}</span>
            </div>
          </div>
          <div
            onClick={() => setSelectedKpi("Total Operational Cost / Expenses")}
            className="border border-neutral-200 bg-white p-5 rounded flex flex-col justify-between cursor-pointer hover:border-black transition-colors"
          >
            <div>
              <div className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Total Operational Cost / Expenses</div>
              <div className="text-xl font-mono font-bold mt-1.5 text-neutral-600">₹{formatNumber(totalExpenses)}</div>
            </div>
            <div className="text-[10px] text-neutral-500 mt-2 border-t border-neutral-100 pt-2">
              All logged machine rents, labor wages, fuel, and site fees.
            </div>
          </div>
          <div
            onClick={() => setSelectedKpi("Projected Portfolio Profit")}
            className="border border-neutral-200 bg-white p-5 rounded flex flex-col justify-between cursor-pointer hover:border-black transition-colors"
          >
            <div>
              <div className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Projected Portfolio Profit</div>
              <div className={`text-xl font-mono font-bold mt-1.5 ${projectedProfit >= 0 ? 'text-black font-extrabold' : 'text-red-600'}`}>
                ₹{formatNumber(projectedProfit)}
              </div>
            </div>
            <div className="text-[10px] text-neutral-500 mt-2 border-t border-neutral-100 pt-2 flex justify-between">
              <span>Margin: {portfolioValuation > 0 ? ((projectedProfit / portfolioValuation) * 100).toFixed(1) : 0}%</span>
              <span>Realized Cash Profit: ₹{formatNumber(realizedProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Work Alerts */}
      <div className="space-y-2">
        {alerts.length > 0 ? alerts.map(renderAlert) : <div className="text-sm text-neutral-500">No upcoming work completions.</div>}
      </div>

      {/* Modules List */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 pb-2 border-b border-neutral-100">
          Construction ERP Modules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                onClick={() => onNavigate(m.id)}
                className="group border border-neutral-200 hover:border-black bg-white p-5 rounded cursor-pointer transition-colors flex items-start gap-4"
              >
                <div className="p-2 border border-neutral-200 group-hover:border-black rounded shrink-0">
                  <Icon className="w-5 h-5 text-black" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-sm tracking-tight">{m.label}</h4>
                    <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-neutral-500 leading-normal">{m.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI details Modal overlay */}
      {selectedKpi && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white border border-neutral-200 rounded max-w-4xl w-full max-h-[85vh] flex flex-col shadow-xl text-black">

            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold uppercase tracking-tight">{selectedKpi} Details</h3>
                <p className="text-xs text-neutral-400">Detailed list and registry data overview</p>
              </div>
              <button
                onClick={() => { setSelectedKpi(null); setStatusFilter("All"); }}
                className="p-1.5 hover:bg-neutral-100 border border-neutral-200 rounded transition-colors text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">

              {/* ACTIVE WORKS / TOTAL WORKS / WORKS COMPLETED */}
              {(selectedKpi === "Active Works" || selectedKpi === "Total Works" || selectedKpi === "Works Completed") && (() => {
                // Determine initial set based on KPI
                let initialGovt = entries;
                if (selectedKpi === "Active Works") {
                  initialGovt = entries.filter(e => e.status !== "Completed");
                } else if (selectedKpi === "Works Completed") {
                  initialGovt = entries.filter(e => e.status === "Completed");
                }

                // Apply status filter
                const filteredGovt = statusFilter === "All"
                  ? initialGovt
                  : entries.filter(e => e.status === statusFilter);

                // Show private works only if not completed KPI and either All or Ongoing filter is selected
                const showPrivate = (selectedKpi === "Active Works" || selectedKpi === "Total Works") &&
                  (statusFilter === "All" || statusFilter === "Ongoing");

                return (
                  <div className="space-y-6">
                    {/* Status Filter Selector */}
                    <div className="flex items-center gap-3 bg-neutral-50 p-4 border border-neutral-200 rounded">
                      <span className="text-[10px] uppercase font-bold text-neutral-500">Filter list by Status of Work:</span>
                      <div className="flex gap-2">
                        {["All", "Not Started", "Ongoing", "Pending", "Completed"].map((statusOption) => (
                          <button
                            key={statusOption}
                            onClick={() => setStatusFilter(statusOption)}
                            className={`px-2.5 py-1 border text-[10px] font-bold uppercase rounded transition-colors ${
                              statusFilter === statusOption
                                ? "bg-black text-white border-black"
                                : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400"
                            }`}
                          >
                            {statusOption}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Govt Contracts Section */}
                    <div>
                      <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Govt Contracts ({statusFilter} Status)</h4>
                      {filteredGovt.length === 0 ? (
                        <p className="text-neutral-500 italic">No contracts found matching the status filter.</p>
                      ) : (
                        <div className="border border-neutral-200 rounded overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                              <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                                <th className="p-3">Work Name</th>
                                <th className="p-3">Office</th>
                                <th className="p-3 text-right">Amount</th>
                                <th className="p-3">Work Status</th>
                                <th className="p-3">Work Completion as per Agreement</th>
                                <th className="p-3">Actual Completion Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 font-mono">
                              {filteredGovt.map(e => (
                                <tr key={e.id} className="hover:bg-neutral-50/50">
                                  <td className="p-3 font-bold font-sans">{e.workName}</td>
                                  <td className="p-3">{e.nameOfOffice}</td>
                                  <td className="p-3 text-right font-semibold">₹{formatNumber(e.amount)}</td>
                                  <td className="p-3">
                                    <span className="font-sans text-[10px] font-bold px-1.5 py-0.5 rounded border border-neutral-300 bg-neutral-50">
                                      {e.status}
                                    </span>
                                  </td>
                                  <td className="p-3">{new Date(e.workCompletionDateAsPerAgreement).toLocaleDateString()}</td>
                                  <td className="p-3">{e.actualCompletionDate ? new Date(e.actualCompletionDate).toLocaleDateString() : "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Private Works Section */}
                    {showPrivate && (
                      <div>
                        <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Private Works (Ongoing)</h4>
                        {privateWorks.length === 0 ? (
                          <p className="text-neutral-500 italic">No private works found.</p>
                        ) : (
                          <div className="border border-neutral-200 rounded overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[700px]">
                              <thead>
                                <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                                  <th className="p-3">Work Name</th>
                                  <th className="p-3">Location</th>
                                  <th className="p-3 text-right">Approx Amount</th>
                                  <th className="p-3">Work Completion as per Agreement</th>
                                  <th className="p-3">Actual Completion Date</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-200 font-mono">
                                {privateWorks.map(pw => (
                                  <tr key={pw.id} className="hover:bg-neutral-50/50">
                                    <td className="p-3 font-bold font-sans">{pw.workName}</td>
                                    <td className="p-3">{pw.location}</td>
                                    <td className="p-3 text-right font-semibold">₹{formatNumber(pw.approxFinalWorkAmount)}</td>
                                    <td className="p-3">{new Date(pw.completedDate).toLocaleDateString()}</td>
                                    <td className="p-3">{pw.completionDate ? new Date(pw.completionDate).toLocaleDateString() : "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* CONTRACT VALUE */}
              {selectedKpi === "Contract Value" && (
                <div>
                  <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Agreement Values (All Govt Contracts)</h4>
                  {entries.length === 0 ? (
                    <p className="text-neutral-500 italic">No government contracts registered.</p>
                  ) : (
                    <div className="border border-neutral-200 rounded overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="p-3">Work Name</th>
                            <th className="p-3">Office Name</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Agreement Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 font-mono">
                          {entries.map(e => (
                            <tr key={e.id} className="hover:bg-neutral-50/50">
                              <td className="p-3 font-bold font-sans">{e.workName}</td>
                              <td className="p-3">{e.nameOfOffice}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${e.status === 'Completed' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
                                  {e.status}
                                </span>
                              </td>
                              <td className="p-3 text-right font-semibold">₹{formatNumber(e.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* CEMENT STOCKED */}
              {selectedKpi === "Cement Stocked" && (
                <div>
                  <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Cement Purchases / Loads</h4>
                  {cementLoads.length === 0 ? (
                    <p className="text-neutral-500 italic">No cement loads logged.</p>
                  ) : (
                    <div className="border border-neutral-200 rounded overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="p-3">Date</th>
                            <th className="p-3">Invoice No</th>
                            <th className="p-3">Company / Brand</th>
                            <th className="p-3">Bags / Tonnes</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3 text-right">Paid</th>
                            <th className="p-3 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 font-mono">
                          {cementLoads.map(cl => (
                            <tr key={cl.id} className="hover:bg-neutral-50/50">
                              <td className="p-3">{new Date(cl.purchaseDate).toLocaleDateString()}</td>
                              <td className="p-3">{cl.invoiceNumber}</td>
                              <td className="p-3 font-sans font-bold">{cl.cementCompany} <span className="text-[10px] text-neutral-400 font-normal">({cl.purchasedFrom})</span></td>
                              <td className="p-3">{cl.loadInBags} Bags / {cl.loadInTonne} T</td>
                              <td className="p-3 text-right">₹{formatNumber(cl.amountPerLoad)}</td>
                              <td className="p-3 text-right text-neutral-600">₹{formatNumber(cl.paidAmount)}</td>
                              <td className="p-3 text-right text-red-600 font-semibold">₹{formatNumber(cl.balanceAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAR AGGREGATE */}
              {selectedKpi === "Tar Aggregate" && (
                <div>
                  <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Tar Emulsion / Bitumen Loads</h4>
                  {tarLoads.length === 0 ? (
                    <p className="text-neutral-500 italic">No tar loads logged.</p>
                  ) : (
                    <div className="border border-neutral-200 rounded overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="p-3">Date</th>
                            <th className="p-3">Item Type</th>
                            <th className="p-3">Quantity</th>
                            <th className="p-3">Office target</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3 text-right">Paid</th>
                            <th className="p-3 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 font-mono">
                          {tarLoads.map(tl => (
                            <tr key={tl.id} className="hover:bg-neutral-50/50">
                              <td className="p-3">{new Date(tl.purchasedDate).toLocaleDateString()}</td>
                              <td className="p-3 font-sans font-bold">{tl.item} <span className="text-[10px] text-neutral-400 font-normal">({tl.purchasedFrom})</span></td>
                              <td className="p-3">{formatNumber(tl.quantityInKg)} Kg ({tl.loadInNoOfPack} Packs)</td>
                              <td className="p-3 font-sans">{tl.addressedOffice}</td>
                              <td className="p-3 text-right">₹{formatNumber(tl.amountPerLoad)}</td>
                              <td className="p-3 text-right text-neutral-600">₹{formatNumber(tl.paidAmount)}</td>
                              <td className="p-3 text-right text-red-600 font-semibold">₹{formatNumber(tl.balanceToBePaid)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}



              {/* TOTAL PORTFOLIO VALUATION */}
              {selectedKpi === "Total Portfolio Valuation" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 bg-neutral-50 p-4 border border-neutral-200 rounded">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-neutral-400">Total Govt Valuation</div>
                      <div className="text-xl font-bold font-mono">₹{formatNumber(totalContractValuation)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-neutral-400">Total Private Valuation</div>
                      <div className="text-xl font-bold font-mono">₹{formatNumber(privateWorksValuation)}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">All Valuation Items</h4>
                    <div className="border border-neutral-200 rounded overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[500px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="p-3">Project / Work Name</th>
                            <th className="p-3">Type</th>
                            <th className="p-3 text-right">Valuation Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 font-mono">
                          {entries.map(e => (
                            <tr key={e.id} className="hover:bg-neutral-50/50">
                              <td className="p-3 font-bold font-sans">{e.workName}</td>
                              <td className="p-3 font-sans">Govt Contract</td>
                              <td className="p-3 text-right font-semibold">₹{formatNumber(e.amount)}</td>
                            </tr>
                          ))}
                          {privateWorks.map(pw => (
                            <tr key={pw.id} className="hover:bg-neutral-50/50">
                              <td className="p-3 font-bold font-sans">{pw.workName}</td>
                              <td className="p-3 font-sans">Private Work</td>
                              <td className="p-3 text-right font-semibold">₹{formatNumber(pw.approxFinalWorkAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TOTAL OPERATIONAL COST / EXPENSES */}
              {selectedKpi === "Total Operational Cost / Expenses" && (
                <div>
                  <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Logged Expenses Registry</h4>
                  {expenses.length === 0 ? (
                    <p className="text-neutral-500 italic">No expenses recorded.</p>
                  ) : (
                    <div className="border border-neutral-200 rounded overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="p-3">Date</th>
                            <th className="p-3">Description</th>
                            <th className="p-3">Associated Work</th>
                            <th className="p-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 font-mono">
                          {expenses.map(exp => (
                            <tr key={exp.id} className="hover:bg-neutral-50/50">
                              <td className="p-3">{new Date(exp.date).toLocaleDateString()}</td>
                              <td className="p-3 font-sans">{exp.description}</td>
                              <td className="p-3 font-sans font-bold">{getWorkName(exp.workId)}</td>
                              <td className="p-3 text-right font-semibold text-red-600">₹{formatNumber(exp.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* PROJECTED PORTFOLIO PROFIT */}
              {selectedKpi === "Projected Portfolio Profit" && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="border border-neutral-200 p-4 rounded bg-neutral-50">
                      <div className="text-[9px] font-bold uppercase text-neutral-400">Total Portfolio Value</div>
                      <div className="text-lg font-bold font-mono mt-1">₹{formatNumber(portfolioValuation)}</div>
                    </div>
                    <div className="border border-neutral-200 p-4 rounded bg-neutral-50">
                      <div className="text-[9px] font-bold uppercase text-neutral-400">Total Expenses</div>
                      <div className="text-lg font-bold font-mono text-neutral-600 mt-1">₹{formatNumber(totalExpenses)}</div>
                    </div>
                    <div className="border border-neutral-200 p-4 rounded bg-neutral-50">
                      <div className="text-[9px] font-bold uppercase text-neutral-400">Projected Profit</div>
                      <div className="text-lg font-bold font-mono text-black mt-1">₹{formatNumber(projectedProfit)}</div>
                    </div>
                    <div className="border border-neutral-200 p-4 rounded bg-neutral-50">
                      <div className="text-[9px] font-bold uppercase text-neutral-400">Realized Cash Profit</div>
                      <div className="text-lg font-bold font-mono text-black mt-1">₹{formatNumber(realizedProfit)}</div>
                    </div>
                  </div>

                  {/* Profitability breakdown per work */}
                  <div>
                    <h4 className="font-bold uppercase text-[10px] tracking-wider text-neutral-400 mb-3">Profitability Breakdown by Project</h4>
                    <div className="border border-neutral-200 rounded overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="bg-neutral-50 border-b border-neutral-200 font-bold uppercase text-[9px] tracking-wider">
                            <th className="p-3">Work Name</th>
                            <th className="p-3">Type</th>
                            <th className="p-3 text-right">Value</th>
                            <th className="p-3 text-right">Expenses</th>
                            <th className="p-3 text-right">Projected Profit</th>
                            <th className="p-3 text-right">Profit Margin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200 font-mono">
                          {entries.map(e => {
                            const projectExpenses = expenses.filter(exp => exp.workId === e.id).reduce((sum, exp) => sum + exp.amount, 0);
                            const projProfit = e.amount - projectExpenses;
                            const margin = e.amount > 0 ? ((projProfit / e.amount) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={e.id} className="hover:bg-neutral-50/50">
                                <td className="p-3 font-bold font-sans">{e.workName}</td>
                                <td className="p-3 font-sans">Govt Contract</td>
                                <td className="p-3 text-right font-semibold">₹{formatNumber(e.amount)}</td>
                                <td className="p-3 text-right text-neutral-600">₹{formatNumber(projectExpenses)}</td>
                                <td className="p-3 text-right font-extrabold text-black">₹{formatNumber(projProfit)}</td>
                                <td className="p-3 text-right font-sans font-bold">{margin}%</td>
                              </tr>
                            );
                          })}
                          {privateWorks.map(pw => {
                            const projectExpenses = expenses.filter(exp => exp.workId === pw.id).reduce((sum, exp) => sum + exp.amount, 0);
                            const projProfit = pw.approxFinalWorkAmount - projectExpenses;
                            const margin = pw.approxFinalWorkAmount > 0 ? ((projProfit / pw.approxFinalWorkAmount) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={pw.id} className="hover:bg-neutral-50/50">
                                <td className="p-3 font-bold font-sans">{pw.workName}</td>
                                <td className="p-3 font-sans">Private Work</td>
                                <td className="p-3 text-right font-semibold">₹{formatNumber(pw.approxFinalWorkAmount)}</td>
                                <td className="p-3 text-right text-neutral-600">₹{formatNumber(projectExpenses)}</td>
                                <td className="p-3 text-right font-extrabold text-black">₹{formatNumber(projProfit)}</td>
                                <td className="p-3 text-right font-sans font-bold">{margin}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

