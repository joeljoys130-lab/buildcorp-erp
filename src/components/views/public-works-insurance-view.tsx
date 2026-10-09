"use client";

import React, { useState, useMemo, useRef } from "react";
import {
  ShieldCheck, Plus, Search, FileText, CheckCircle2,
  AlertCircle, Clock, Eye, Edit2, Upload, FileDown,
  X, ChevronLeft, ChevronRight, Filter, AlertTriangle,
  Trash2
} from "lucide-react";
import { PublicWorksInsurance, Entry } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
// Date formatting utilities (self-contained to prevent circular module dependencies)
const getTodayLocalString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateForInput = (dateInput: unknown): string => {
  if (!dateInput) return "";
  if (typeof dateInput === 'string') {
    const isoMatch = dateInput.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
  }
  const d = new Date(dateInput as string | number | Date);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (dateInput: unknown): string => {
  if (!dateInput) return "";
  const ymd = formatDateForInput(dateInput);
  if (!ymd || ymd.length < 10) return "";
  const [year, month, day] = ymd.split('-');
  return `${day}/${month}/${year}`;
};

interface PublicWorksInsuranceViewProps {
  insuranceRecords: PublicWorksInsurance[];
  entries: Entry[];
  onRefresh: () => Promise<void> | void;
  onCreateInsurance: (data: Omit<PublicWorksInsurance, "id" | "createdAt" | "updatedAt">) => Promise<PublicWorksInsurance | null>;
  onUpdateInsurance: (id: string, data: Partial<PublicWorksInsurance>) => Promise<PublicWorksInsurance | null>;
  onDeleteInsurance?: (id: string) => Promise<boolean>;
  onOptimisticUpdate?: (updated: PublicWorksInsurance) => void;
  onOptimisticDelete?: (id: string) => void;
  onNavigate?: (tab: string) => void;
}

interface FormState {
  workId: string;
  insuranceAgentName: string;
  mobileNumber: string;
  loaSentDate: string;
  insuranceFee: string;
  insuranceReceivedDate: string;
  documentName: string;
  documentPath: string;
  documentMimeType: string;
  documentSize: number | null;
}

interface FormErrors {
  workId?: string;
  insuranceAgentName?: string;
  mobileNumber?: string;
  loaSentDate?: string;
  insuranceFee?: string;
  insuranceReceivedDate?: string;
  file?: string;
}

const INITIAL_FORM: FormState = {
  workId: "",
  insuranceAgentName: "",
  mobileNumber: "",
  loaSentDate: getTodayLocalString(),
  insuranceFee: "",
  insuranceReceivedDate: "",
  documentName: "",
  documentPath: "",
  documentMimeType: "",
  documentSize: null,
};

export function PublicWorksInsuranceView({
  insuranceRecords,
  entries,
  onRefresh,
  onCreateInsurance,
  onUpdateInsurance,
  onDeleteInsurance,
  onOptimisticUpdate,
  onOptimisticDelete,
}: PublicWorksInsuranceViewProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Form State & Validation Errors
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  // Table Filtering, Search & Pagination State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "RECEIVED" | "PENDING">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // View Details Modal State
  const [viewRecord, setViewRecord] = useState<PublicWorksInsurance | null>(null);

  // ── Eligible Public Works Calculation ──────────────────────────────────────
  // Rules:
  // 1. Must be Public Work (Entry model)
  // 2. Status !== 'Not Started'
  // 3. Work data has been entered (workName is non-empty)
  // 4. One active policy per work (unless currently editing this work's record)
  const eligibleWorks = useMemo(() => {
    // Collect workIds that already have an active insurance policy
    const insuredWorkIds = new Set(
      insuranceRecords
        .filter((ins) => !ins.deletedAt)
        .map((ins) => ins.workId)
    );

    return entries.filter((entry) => {
      // Must not be deleted
      if (entry.deletedAt) return false;

      // Rule: Work must have started
      if (!entry.status || entry.status === "Not Started") return false;

      // Rule: Work data must be entered
      if (!entry.workName || entry.workName.trim() === "") return false;

      // Rule: Deduplicate active policies, but allow current work when editing
      if (insuredWorkIds.has(entry.id) && entry.id !== form.workId) {
        return false;
      }

      return true;
    });
  }, [entries, insuranceRecords, form.workId]);

  // Metrics
  const metrics = useMemo(() => {
    const active = insuranceRecords.filter((r) => !r.deletedAt);
    const totalFees = active.reduce((sum, r) => sum + (Number(r.insuranceFee) || 0), 0);
    const receivedCount = active.filter((r) => Boolean(r.insuranceReceivedDate)).length;
    const pendingCount = active.length - receivedCount;
    return {
      total: active.length,
      totalFees,
      receivedCount,
      pendingCount,
    };
  }, [insuranceRecords]);

  // Form field setter
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key as keyof FormErrors]: undefined }));
    }
  };

  // Client-side Validation
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.workId) {
      newErrors.workId = "Please select an eligible public work.";
    }

    if (!form.insuranceAgentName.trim()) {
      newErrors.insuranceAgentName = "Insurance agent name is required.";
    }

    const trimmedPhone = form.mobileNumber.trim();
    if (!trimmedPhone) {
      newErrors.mobileNumber = "Mobile number is required.";
    } else {
      const rawDigits = trimmedPhone.replace(/\D/g, "");
      if (rawDigits.length < 10 || rawDigits.length > 15 || !/^\+?[0-9\s\-()]{10,20}$/.test(trimmedPhone)) {
        newErrors.mobileNumber = "Enter a valid 10-15 digit mobile number.";
      }
    }

    if (!form.loaSentDate) {
      newErrors.loaSentDate = "LOA sent date is required.";
    }

    const feeNum = parseFloat(form.insuranceFee);
    if (isNaN(feeNum) || feeNum <= 0) {
      newErrors.insuranceFee = "Insurance fee must be a positive number greater than 0.";
    }

    if (form.insuranceReceivedDate && form.loaSentDate) {
      const loa = new Date(form.loaSentDate);
      const rec = new Date(form.insuranceReceivedDate);
      if (rec < loa) {
        newErrors.insuranceReceivedDate = "Received date cannot be earlier than LOA sent date.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size on client
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        file: "File size exceeds 10MB limit. Please upload a smaller document.",
      }));
      e.target.value = "";
      return;
    }

    // Check extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext || "")) {
      setErrors((prev) => ({
        ...prev,
        file: "Invalid file format. Only PDF, JPG, PNG, and WebP documents are supported.",
      }));
      e.target.value = "";
      return;
    }

    setErrors((prev) => ({ ...prev, file: undefined }));
    setSelectedFile(file);
    setField("documentName", file.name);
    setField("documentSize", file.size);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setField("documentName", "");
    setField("documentPath", "");
    setField("documentMimeType", "");
    setField("documentSize", null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Upload file to server endpoint
  const uploadDocumentToServer = async (file: File): Promise<{
    documentName: string;
    documentPath: string;
    documentMimeType: string;
    documentSize: number;
  }> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/insurance/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to upload document file.");
    }

    return data.document;
  };

  // Form Submit Handler (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Validation Error", "Please review the highlighted fields in the form.");
      return;
    }

    setIsSaving(true);
    let newlyUploadedDocPath: string | null = null;
    try {
      let docName = form.documentName;
      let docPath = form.documentPath;
      let docMime = form.documentMimeType;
      let docSize = form.documentSize;

      // If user selected a new file, upload it first
      if (selectedFile) {
        setIsUploading(true);
        const uploaded = await uploadDocumentToServer(selectedFile);
        docName = uploaded.documentName;
        docPath = uploaded.documentPath;
        docMime = uploaded.documentMimeType;
        docSize = uploaded.documentSize;
        newlyUploadedDocPath = uploaded.documentPath;
        setIsUploading(false);
      }

      const selectedWork = entries.find((en) => en.id === form.workId);

      const payload = {
        workId: form.workId,
        workName: selectedWork ? selectedWork.workName : "",
        workReferenceNo: selectedWork?.agreementNo || null,
        insuranceAgentName: form.insuranceAgentName.trim(),
        mobileNumber: form.mobileNumber.trim(),
        loaSentDate: new Date(form.loaSentDate),
        insuranceFee: parseFloat(form.insuranceFee),
        insuranceReceivedDate: form.insuranceReceivedDate ? new Date(form.insuranceReceivedDate) : null,
        documentName: docName || null,
        documentPath: docPath || null,
        documentMimeType: docMime || null,
        documentSize: docSize || null,
      };

      try {
        if (editingId) {
          const updated = await onUpdateInsurance(editingId, payload);
          if (onOptimisticUpdate && updated) {
            onOptimisticUpdate(updated);
          }
          toast.success("Insurance Updated", "Insurance record updated successfully.");
        } else {
          const created = await onCreateInsurance(payload);
          if (onOptimisticUpdate && created) {
            onOptimisticUpdate(created);
          }
          toast.success("Insurance Saved", "Public works insurance record created successfully.");
        }
      } catch (saveError) {
        // Rollback uploaded document if record persistence fails to prevent orphaned files
        if (newlyUploadedDocPath) {
          fetch('/api/insurance/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentPath: newlyUploadedDocPath }),
          }).catch(() => {});
        }
        throw saveError;
      }

      await onRefresh();
      handleCancel();
    } catch (err: unknown) {
      console.error("Failed to save insurance:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred while saving.";
      toast.error("Save Failed", message);
    } finally {
      setIsSaving(false);
      setIsUploading(false);
    }
  };

  const handleDelete = async (rec: PublicWorksInsurance) => {
    if (!onDeleteInsurance) return;
    if (window.confirm(`Are you sure you want to delete the insurance record for "${rec.workName}"? Stored policy documents will also be permanently removed.`)) {
      try {
        await onDeleteInsurance(rec.id);
        if (onOptimisticDelete) {
          onOptimisticDelete(rec.id);
        }
        toast.success("Insurance Deleted", "Insurance record and associated documents deleted.");
        if (onRefresh) await onRefresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to delete insurance record.";
        toast.error("Delete Failed", msg);
      }
    }
  };

  const handleEdit = (rec: PublicWorksInsurance) => {
    setEditingId(rec.id);
    setSelectedFile(null);
    setForm({
      workId: rec.workId,
      insuranceAgentName: rec.insuranceAgentName,
      mobileNumber: rec.mobileNumber,
      loaSentDate: formatDateForInput(rec.loaSentDate),
      insuranceFee: rec.insuranceFee.toString(),
      insuranceReceivedDate: rec.insuranceReceivedDate ? formatDateForInput(rec.insuranceReceivedDate) : "",
      documentName: rec.documentName || "",
      documentPath: rec.documentPath || "",
      documentMimeType: rec.documentMimeType || "",
      documentSize: rec.documentSize || null,
    });
    setErrors({});
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setSelectedFile(null);
    setForm(INITIAL_FORM);
    setErrors({});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Filtered & Searched records
  const filteredRecords = useMemo(() => {
    return insuranceRecords.filter((rec) => {
      if (rec.deletedAt) return false;

      // Status filter
      if (statusFilter === "RECEIVED" && !rec.insuranceReceivedDate) return false;
      if (statusFilter === "PENDING" && Boolean(rec.insuranceReceivedDate)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesWork = (rec.workName || "").toLowerCase().includes(q);
        const matchesRef = (rec.workReferenceNo || "").toLowerCase().includes(q);
        const matchesAgent = (rec.insuranceAgentName || "").toLowerCase().includes(q);
        const matchesMobile = (rec.mobileNumber || "").includes(q);
        if (!matchesWork && !matchesRef && !matchesAgent && !matchesMobile) return false;
      }

      return true;
    });
  }, [insuranceRecords, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / itemsPerPage));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRecords.slice(start, start + itemsPerPage);
  }, [filteredRecords, currentPage]);

  return (
    <div className="space-y-6 pb-12">
      {/* Enterprise Document Print Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h2 className="text-xl font-bold uppercase tracking-wider">Aravind Associates</h2>
        <p className="text-xs text-neutral-600">Public Works Insurance Register</p>
      </div>

      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-black text-white rounded">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-black">
              Public Works Insurance
            </h1>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Manage mandatory insurance policies for active government and public works contracts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!showForm && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(INITIAL_FORM);
                setSelectedFile(null);
                setErrors({});
                setShowForm(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Record Insurance</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
            Total Policies
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-black">
            {metrics.total}
          </div>
          <span className="text-[10px] text-neutral-400">Registered public policies</span>
        </div>

        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
            Total Insurance Fees
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-black">
            ₹{metrics.totalFees.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-neutral-400">Total premium outlay</span>
        </div>

        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider">
            Document Received
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-emerald-700">
            {metrics.receivedCount}
          </div>
          <span className="text-[10px] text-neutral-400">Policies with certificate</span>
        </div>

        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-600 tracking-wider">
            Document Pending
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-amber-600">
            {metrics.pendingCount}
          </div>
          <span className="text-[10px] text-neutral-400">Awaiting policy receipt</span>
        </div>
      </div>

      {/* Insurance Entry / Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-neutral-300 bg-neutral-50/70 p-5 rounded-lg space-y-4 shadow-sm animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-black">
                {editingId ? "Edit Insurance Record" : "New Public Works Insurance"}
              </span>
              <span className="text-[10px] text-neutral-500 border border-neutral-300 rounded px-1.5 py-0.5 bg-white">
                Public Works Only
              </span>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-neutral-400 hover:text-black p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Work Name Dropdown */}
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                Work Name <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.workId}
                onChange={(e) => setField("workId", e.target.value)}
                className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                  errors.workId ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                }`}
              >
                <option value="">-- Select Eligible Public Work (Started Only) --</option>
                {eligibleWorks.map((work) => (
                  <option key={work.id} value={work.id}>
                    {work.workName} {work.agreementNo ? `(Agr. No: ${work.agreementNo})` : ""} — Status: {work.status}
                  </option>
                ))}
              </select>
              {errors.workId && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.workId}
                </p>
              )}
              {eligibleWorks.length === 0 && (
                <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No unsponsored public works currently available. Only started contract works (status: Ongoing, Pending, Completed) are eligible.
                </p>
              )}
            </div>

            {/* 2. Insurance Agent Name */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                Insurance Agent Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Agent or Agency Name"
                value={form.insuranceAgentName}
                onChange={(e) => setField("insuranceAgentName", e.target.value)}
                className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                  errors.insuranceAgentName ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                }`}
              />
              {errors.insuranceAgentName && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.insuranceAgentName}
                </p>
              )}
            </div>

            {/* 3. Mobile Number */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="e.g. +91 9876543210"
                value={form.mobileNumber}
                onChange={(e) => setField("mobileNumber", e.target.value)}
                className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white font-mono transition-colors ${
                  errors.mobileNumber ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                }`}
              />
              {errors.mobileNumber && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.mobileNumber}
                </p>
              )}
            </div>

            {/* 4. LOA Sent Date */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                LOA Sent Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.loaSentDate}
                onChange={(e) => setField("loaSentDate", e.target.value)}
                className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                  errors.loaSentDate ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                }`}
              />
              {errors.loaSentDate && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.loaSentDate}
                </p>
              )}
            </div>

            {/* 5. Insurance Fee */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                Insurance Fee (₹) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-mono text-neutral-500">₹</span>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={form.insuranceFee}
                  onChange={(e) => setField("insuranceFee", e.target.value)}
                  className={`w-full pl-7 pr-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white font-mono transition-colors ${
                    errors.insuranceFee ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                />
              </div>
              {errors.insuranceFee && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.insuranceFee}
                </p>
              )}
            </div>

            {/* 6. Insurance Received Date */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                Insurance Received Date <span className="text-neutral-400 font-normal">(Optional)</span>
              </label>
              <input
                type="date"
                value={form.insuranceReceivedDate}
                onChange={(e) => setField("insuranceReceivedDate", e.target.value)}
                className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                  errors.insuranceReceivedDate ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                }`}
              />
              <span className="text-[10px] text-neutral-400 block mt-0.5">
                Leave empty if document has not yet been received.
              </span>
              {errors.insuranceReceivedDate && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.insuranceReceivedDate}
                </p>
              )}
            </div>

            {/* 7. Upload Insurance Document */}
            <div className="lg:col-span-2">
              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                Upload Insurance Document <span className="text-neutral-400 font-normal">(PDF, JPG, PNG, WebP — Max 10MB)</span>
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  id="insurance-doc-input"
                />

                <label
                  htmlFor="insurance-doc-input"
                  className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-neutral-400 hover:border-black rounded text-xs font-semibold cursor-pointer text-neutral-700 hover:text-black bg-white transition-colors shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{form.documentName ? "Replace Document" : "Choose Document"}</span>
                </label>

                {/* Display Selected or Existing File */}
                {form.documentName && (
                  <div className="flex-1 flex items-center justify-between px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-neutral-600 shrink-0" />
                      <span className="font-medium text-black truncate">{form.documentName}</span>
                      {form.documentSize && (
                        <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                          ({(form.documentSize / 1024).toFixed(0)} KB)
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      className="text-neutral-400 hover:text-red-600 p-1 shrink-0 ml-2"
                      title="Remove document"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {errors.file && (
                <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3" />
                  {errors.file}
                </p>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="px-3.5 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {isUploading
                  ? "Uploading..."
                  : isSaving
                  ? "Saving..."
                  : editingId
                  ? "Update Insurance"
                  : "Save Insurance"}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Main Records Table Container */}
      <div className="border border-neutral-200 bg-white rounded overflow-hidden shadow-2xs">
        {/* Table Search and Filter Bar */}
        <div className="p-3.5 border-b border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-50/50 print:hidden">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by work name, agent, phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-neutral-400 mr-1 hidden sm:inline" />
            <span className="text-[10px] font-bold uppercase text-neutral-500 mr-1 hidden sm:inline">
              Status:
            </span>
            {(["ALL", "RECEIVED", "PENDING"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setStatusFilter(filter);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  statusFilter === filter
                    ? "bg-black text-white"
                    : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
                }`}
              >
                {filter === "ALL" ? "All" : filter === "RECEIVED" ? "Received" : "Pending"}
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-500 tracking-wider">
                <th className="p-3">Work Name</th>
                <th className="p-3">Reference No.</th>
                <th className="p-3">Insurance Agent</th>
                <th className="p-3">Mobile Number</th>
                <th className="p-3">LOA Sent Date</th>
                <th className="p-3 text-right">Insurance Fee</th>
                <th className="p-3 text-center">Status / Received</th>
                <th className="p-3 text-center">Document</th>
                <th className="p-3 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {paginatedRecords.map((rec) => {
                const isReceived = Boolean(rec.insuranceReceivedDate);
                return (
                  <tr key={rec.id} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Work Name */}
                    <td className="p-3 font-semibold text-black">
                      <div className="flex flex-col">
                        <span>{rec.workName}</span>
                        <span className="text-[10px] text-neutral-400 font-normal">Public Work</span>
                      </div>
                    </td>

                    {/* Reference No */}
                    <td className="p-3 font-mono text-neutral-700">
                      {rec.workReferenceNo || "—"}
                    </td>

                    {/* Insurance Agent */}
                    <td className="p-3 text-black font-medium">
                      {rec.insuranceAgentName}
                    </td>

                    {/* Mobile Number */}
                    <td className="p-3 font-mono text-neutral-700">
                      <a
                        href={`tel:${rec.mobileNumber}`}
                        className="hover:underline hover:text-black"
                      >
                        {rec.mobileNumber}
                      </a>
                    </td>

                    {/* LOA Sent Date */}
                    <td className="p-3 font-mono text-neutral-700">
                      {formatDateDisplay(rec.loaSentDate)}
                    </td>

                    {/* Insurance Fee */}
                    <td className="p-3 text-right font-mono font-bold text-black">
                      ₹{Number(rec.insuranceFee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>

                    {/* Insurance Received Status */}
                    <td className="p-3 text-center">
                      {isReceived ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{formatDateDisplay(rec.insuranceReceivedDate)}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    {/* Insurance Document */}
                    <td className="p-3 text-center">
                      {rec.documentPath ? (
                        <a
                          href={`/api/insurance/documents/${rec.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 hover:text-black underline underline-offset-2"
                          title={rec.documentName || "View Document"}
                        >
                          <FileText className="w-3.5 h-3.5 text-neutral-700" />
                          <span className="max-w-[120px] truncate">
                            {rec.documentName || "Document"}
                          </span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-neutral-400 italic">
                          Not Uploaded
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right print:hidden">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewRecord(rec)}
                          className="p-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                          title="View Policy Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEdit(rec)}
                          className="p-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                          title="Edit Policy Record"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteInsurance && (
                          <button
                            onClick={() => handleDelete(rec)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors"
                            title="Delete Policy Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Empty state */}
              {paginatedRecords.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center text-neutral-400">
                      <ShieldCheck className="w-10 h-10 stroke-[1.5] mb-2 text-neutral-300" />
                      <p className="text-sm font-semibold text-neutral-600">
                        {searchQuery || statusFilter !== "ALL"
                          ? "No matching insurance records found."
                          : "No public works insurance records recorded yet."}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                        {searchQuery || statusFilter !== "ALL"
                          ? "Try adjusting your search criteria or filter options."
                          : "Insurance records are created for eligible public works once work has started."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-500 bg-neutral-50/50 print:hidden">
            <span>
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, filteredRecords.length)} of{" "}
              {filteredRecords.length} records
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 border border-neutral-300 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] font-semibold text-neutral-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 border border-neutral-300 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Details Modal */}
      {viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-black text-white">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <h3 className="font-bold text-xs uppercase tracking-wider">
                  Public Works Insurance Details
                </h3>
              </div>
              <button
                onClick={() => setViewRecord(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                  Public Work Title
                </span>
                <span className="text-sm font-bold text-black">{viewRecord.workName}</span>
                {viewRecord.workReferenceNo && (
                  <span className="text-xs text-neutral-500 block font-mono">
                    Agreement No: {viewRecord.workReferenceNo}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-neutral-100 py-3">
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Insurance Agent
                  </span>
                  <span className="font-semibold text-black">{viewRecord.insuranceAgentName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Mobile Number
                  </span>
                  <a
                    href={`tel:${viewRecord.mobileNumber}`}
                    className="font-mono font-semibold text-black hover:underline"
                  >
                    {viewRecord.mobileNumber}
                  </a>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    LOA Sent Date
                  </span>
                  <span className="font-mono text-neutral-800">
                    {formatDateDisplay(viewRecord.loaSentDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Insurance Fee
                  </span>
                  <span className="font-mono font-bold text-black text-sm">
                    ₹{Number(viewRecord.insuranceFee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Insurance Received Date
                  </span>
                  {viewRecord.insuranceReceivedDate ? (
                    <span className="font-mono text-emerald-700 font-semibold">
                      {formatDateDisplay(viewRecord.insuranceReceivedDate)}
                    </span>
                  ) : (
                    <span className="text-amber-700 font-medium italic">Pending Receipt</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Policy Document
                  </span>
                  {viewRecord.documentPath ? (
                    <span className="text-emerald-700 font-medium">Uploaded & Secured</span>
                  ) : (
                    <span className="text-neutral-400 italic">Not Uploaded</span>
                  )}
                </div>
              </div>

              {/* Document Download / View Section */}
              {viewRecord.documentPath && (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-neutral-700 shrink-0" />
                    <div className="truncate">
                      <p className="font-semibold text-black truncate">
                        {viewRecord.documentName || "Insurance Policy Document"}
                      </p>
                      {viewRecord.documentSize && (
                        <p className="text-[10px] text-neutral-400 font-mono">
                          {(viewRecord.documentSize / 1024).toFixed(0)} KB • Protected Storage
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <a
                      href={`/api/insurance/documents/${viewRecord.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-white border border-neutral-300 hover:border-black rounded text-[11px] font-semibold text-black transition-colors"
                    >
                      View
                    </a>
                    <a
                      href={`/api/insurance/documents/${viewRecord.id}?download=1`}
                      className="flex items-center gap-1 px-2.5 py-1 bg-black text-white hover:bg-neutral-850 rounded text-[11px] font-semibold transition-colors"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const rec = viewRecord;
                  setViewRecord(null);
                  handleEdit(rec);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 hover:bg-white text-xs font-semibold rounded text-black bg-white cursor-pointer transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Record</span>
              </button>
              <button
                onClick={() => setViewRecord(null)}
                className="px-3 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer transition-colors"
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
export default PublicWorksInsuranceView;
