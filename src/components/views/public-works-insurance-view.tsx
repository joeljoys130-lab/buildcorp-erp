"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ShieldCheck, Plus, Search, FileText, CheckCircle2,
  AlertCircle, Clock, Eye, Edit2, Upload, FileDown,
  X, ChevronLeft, ChevronRight, Filter, AlertTriangle,
  Trash2, Files, ExternalLink, Image as ImageIcon,
  FolderOpen, ArrowUpDown, Loader2
} from "lucide-react";
import { PublicWorksInsurance, PublicWorksDocument, Entry } from "@/lib/types";
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

const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Safe HTTP response parsing helper to gracefully handle non-JSON, empty, or HTML error responses
async function parseResponseSafely(res: Response): Promise<{ success?: boolean; data?: any; error?: string }> {
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    bodyText = "";
  }

  if (bodyText) {
    try {
      return JSON.parse(bodyText);
    } catch {
      // Non-JSON or malformed response (e.g. HTML error page or truncated string)
      const cleanSnippet = bodyText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
      return {
        error: cleanSnippet || `Server returned HTTP ${res.status} ${res.statusText || 'Error'}`,
      };
    }
  }

  return {
    error: `Server returned HTTP ${res.status} ${res.statusText || 'No response body'}`,
  };
}


// Real-time Upload Progress Info
export interface UploadProgressInfo {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  statusText: string;
  stage: 'preparing' | 'uploading' | 'processing' | 'complete' | 'error';
}

// Document category definitions
export const DOCUMENT_CATEGORIES = [
  { id: "ALL", label: "All Documents", tag: "All" },
  { id: "TAR_BILL", label: "Tar Bill", tag: "Tar Bill", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "SECURITY", label: "Security", tag: "Security", badgeClass: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "ESTIMATE", label: "Estimate", tag: "Estimate", badgeClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "SITE_PLAN", label: "Site Plan", tag: "Site Plan", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "INSURANCE", label: "Insurance", tag: "Insurance", badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-300" },
] as const;

export function getCategoryBadge(category: string): { label: string; badgeClass: string } {
  const upper = (category || "").toUpperCase().replace(/[\s-]/g, "_");
  const found = DOCUMENT_CATEGORIES.find((c) => c.id === upper);
  if (found && found.id !== "ALL") {
    return { label: found.label, badgeClass: found.badgeClass };
  }
  return { label: category || "General", badgeClass: "bg-neutral-100 text-neutral-700 border-neutral-200" };
}

interface PublicWorksInsuranceViewProps {
  insuranceRecords: PublicWorksInsurance[];
  documents?: PublicWorksDocument[];
  entries: Entry[];
  onRefresh: () => Promise<void> | void;
  onRefreshDocuments?: () => Promise<void> | void;
  onCreateInsurance: (data: Omit<PublicWorksInsurance, "id" | "createdAt" | "updatedAt">) => Promise<PublicWorksInsurance | null>;
  onUpdateInsurance: (id: string, data: Partial<PublicWorksInsurance>) => Promise<PublicWorksInsurance | null>;
  onDeleteInsurance?: (id: string) => Promise<boolean>;
  onCreateDocument?: (data: {
    workId: string;
    category: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    documentPath: string;
    uploaderName?: string;
  }) => Promise<PublicWorksDocument | null>;
  onDeleteDocument?: (id: string) => Promise<boolean>;
  onOptimisticUpdate?: (updated: PublicWorksInsurance) => void;
  onOptimisticDelete?: (id: string) => void;
  onOptimisticUpdateDocument?: (updated: PublicWorksDocument) => void;
  onOptimisticDeleteDocument?: (id: string) => void;
  onNavigate?: (tab: string) => void;
}

interface InsuranceFormState {
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

interface InsuranceFormErrors {
  workId?: string;
  insuranceAgentName?: string;
  mobileNumber?: string;
  loaSentDate?: string;
  insuranceFee?: string;
  insuranceReceivedDate?: string;
  file?: string;
}

const INITIAL_INSURANCE_FORM: InsuranceFormState = {
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
  insuranceRecords = [],
  documents = [],
  entries = [],
  onRefresh,
  onRefreshDocuments,
  onCreateInsurance,
  onUpdateInsurance,
  onDeleteInsurance,
  onCreateDocument,
  onDeleteDocument,
  onOptimisticUpdate,
  onOptimisticDelete,
  onOptimisticUpdateDocument,
  onOptimisticDeleteDocument,
}: PublicWorksInsuranceViewProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // ── INSURANCE FORM & UI STATE ──────────────────────────────────────────────
  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [editingInsuranceId, setEditingInsuranceId] = useState<string | null>(null);
  const [isInsuranceSaving, setIsInsuranceSaving] = useState(false);
  const [isInsuranceUploading, setIsInsuranceUploading] = useState(false);
  const [selectedInsuranceFile, setSelectedInsuranceFile] = useState<File | null>(null);
  const [insuranceForm, setInsuranceForm] = useState<InsuranceFormState>(INITIAL_INSURANCE_FORM);
  const [insuranceErrors, setInsuranceErrors] = useState<InsuranceFormErrors>({});

  // Insurance Table Search & Pagination
  const [insuranceSearchQuery, setInsuranceSearchQuery] = useState("");
  const [insuranceStatusFilter, setInsuranceStatusFilter] = useState<"ALL" | "RECEIVED" | "PENDING">("ALL");
  const [insuranceCurrentPage, setInsuranceCurrentPage] = useState(1);
  const insuranceItemsPerPage = 8;
  const [viewInsuranceRecord, setViewInsuranceRecord] = useState<PublicWorksInsurance | null>(null);

  // ── DOCUMENT MANAGEMENT STATE ──────────────────────────────────────────────
  const [selectedWorkFilter, setSelectedWorkFilter] = useState<string>("ALL");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [documentSearchQuery, setDocumentSearchQuery] = useState("");
  const [docCurrentPage, setDocCurrentPage] = useState(1);
  const docItemsPerPage = 10;

  // Document Upload Modal State
  const [showDocUploadModal, setShowDocUploadModal] = useState(false);
  const [docUploadWorkId, setDocUploadWorkId] = useState("");
  const [docUploadCategory, setDocUploadCategory] = useState<string>("TAR_BILL");
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [isDocUploading, setIsDocUploading] = useState(false);
  const [docUploadProgress, setDocUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [docUploadErrors, setDocUploadErrors] = useState<{ workId?: string; category?: string; file?: string }>({});
  const [docUploadErrorBanner, setDocUploadErrorBanner] = useState<string | null>(null);
  const [docUploadSuccessBanner, setDocUploadSuccessBanner] = useState<string | null>(null);
  const isSubmittingDocRef = useRef(false);
  const isSubmittingInsuranceRef = useRef(false);

  // Document View Modal State with client-side blob caching & loading state
  const [previewDoc, setPreviewDoc] = useState<PublicWorksDocument | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewIsFromCache, setPreviewIsFromCache] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);

  // In-memory cache of raw Blobs (retained across open/close cycles without leaking object URLs)
  const blobCacheRef = useRef<Map<string, { blob: Blob; mimeType: string; fileName: string; cachedAt: number }>>(new Map());

  // Clean up object URLs on component unmount to release browser memory
  useEffect(() => {
    return () => {
      if (activePreviewUrl) {
        try {
          URL.revokeObjectURL(activePreviewUrl);
        } catch {}
      }
      blobCacheRef.current.clear();
    };
  }, [activePreviewUrl]);

  const handleOpenDocumentPreview = async (doc: PublicWorksDocument) => {
    const tStart = performance.now();

    // Release any previous active session object URL immediately
    if (activePreviewUrl) {
      try {
        URL.revokeObjectURL(activePreviewUrl);
      } catch {}
      setActivePreviewUrl(null);
    }

    setPreviewDoc(doc);
    setPreviewError(null);

    // 1. Check in-memory blob cache for instant reuse (0ms, 0 network requests, 0 DB round trips)
    const cached = blobCacheRef.current.get(doc.id);
    if (cached) {
      const objectUrl = URL.createObjectURL(cached.blob);
      setActivePreviewUrl(objectUrl);
      setPreviewIsFromCache(true);
      setPreviewLoading(false);
      const totalMs = performance.now() - tStart;
      console.info(`[DOC_PREVIEW] docId="${doc.id}" cacheHit=true totalMs=${totalMs.toFixed(1)}`);
      return;
    }

    // 2. Load from server with loading state
    setPreviewLoading(true);
    setPreviewIsFromCache(false);
    try {
      const res = await fetch(`/api/insurance/documents/${doc.id}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to load document (${res.status})`);
      }
      const blob = await res.blob();
      const mime = doc.mimeType || blob.type || 'application/pdf';

      // Keep cache bounded to 10 recent documents
      if (blobCacheRef.current.size >= 10) {
        const oldestKey = blobCacheRef.current.keys().next().value;
        if (oldestKey) blobCacheRef.current.delete(oldestKey);
      }

      blobCacheRef.current.set(doc.id, {
        blob,
        mimeType: mime,
        fileName: doc.fileName,
        cachedAt: Date.now(),
      });

      const objectUrl = URL.createObjectURL(blob);
      setActivePreviewUrl(objectUrl);
      const totalMs = performance.now() - tStart;
      console.info(`[DOC_PREVIEW] docId="${doc.id}" cacheHit=false totalMs=${totalMs.toFixed(1)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load document preview.';
      console.error('Failed to load document preview:', err);
      setPreviewError(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCloseDocumentPreview = () => {
    // Release temporary browser object URL immediately when preview closes
    if (activePreviewUrl) {
      try {
        URL.revokeObjectURL(activePreviewUrl);
      } catch {}
    }
    setActivePreviewUrl(null);
    setPreviewDoc(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewIsFromCache(false);
  };

  const handleDownloadDocument = (doc: PublicWorksDocument) => {
    const cached = blobCacheRef.current.get(doc.id);
    if (cached) {
      const tempUrl = URL.createObjectURL(cached.blob);
      const a = document.createElement('a');
      a.href = tempUrl;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(tempUrl);
        } catch {}
      }, 1000);
      return;
    }
    // Fall back to server download endpoint
    const link = document.createElement('a');
    link.href = `/api/insurance/documents/${doc.id}?download=1`;
    link.download = doc.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInsuranceDocPreview = (rec: PublicWorksInsurance) => {
    if (!rec.documentPath) return;
    const synthDoc: PublicWorksDocument = {
      id: `ins-doc-${rec.id}`,
      organizationId: rec.organizationId || null,
      ownerEmail: rec.ownerEmail || "",
      workId: rec.workId,
      workName: rec.workName,
      category: 'INSURANCE',
      fileName: rec.documentName || 'Insurance-Policy.pdf',
      fileSize: rec.documentSize || 0,
      mimeType: rec.documentMimeType || 'application/pdf',
      documentPath: rec.documentPath,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
    handleOpenDocumentPreview(synthDoc);
  };

  // Document Delete Confirmation Modal State
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<PublicWorksDocument | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);

  // ── Eligible Public Works Calculation ──────────────────────────────────────
  // Rules:
  // 1. Must be Public Work (Entry model)
  // 2. Status !== 'Not Started'
  // 3. Work data has been entered (workName is non-empty)
  const eligibleStartedWorks = useMemo(() => {
    return entries.filter((entry) => {
      if (entry.deletedAt) return false;
      if (!entry.status || entry.status === "Not Started") return false;
      if (!entry.workName || entry.workName.trim() === "") return false;
      return true;
    });
  }, [entries]);

  // Eligible works for insurance dropdown (excludes works with existing active policy, unless editing)
  const eligibleWorksForInsurance = useMemo(() => {
    const insuredWorkIds = new Set(
      insuranceRecords
        .filter((ins) => !ins.deletedAt)
        .map((ins) => ins.workId)
    );

    return eligibleStartedWorks.filter((entry) => {
      if (insuredWorkIds.has(entry.id) && entry.id !== insuranceForm.workId) {
        return false;
      }
      return true;
    });
  }, [eligibleStartedWorks, insuranceRecords, insuranceForm.workId]);

  // ── Overview Metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const activeInsurances = insuranceRecords.filter((r) => !r.deletedAt);
    const totalFees = activeInsurances.reduce((sum, r) => sum + (Number(r.insuranceFee) || 0), 0);
    const receivedCount = activeInsurances.filter((r) => Boolean(r.insuranceReceivedDate)).length;
    const pendingCount = activeInsurances.length - receivedCount;
    const activeDocs = documents.filter((d) => !d.deletedAt);

    return {
      totalDocs: activeDocs.length,
      totalPolicies: activeInsurances.length,
      totalFees,
      receivedCount,
      pendingCount,
    };
  }, [insuranceRecords, documents]);

  // ── INSURANCE FORM ACTIONS ─────────────────────────────────────────────────
  const setInsuranceField = <K extends keyof InsuranceFormState>(key: K, value: InsuranceFormState[K]) => {
    setInsuranceForm((prev) => ({ ...prev, [key]: value }));
    if (insuranceErrors[key as keyof InsuranceFormErrors]) {
      setInsuranceErrors((prev) => ({ ...prev, [key as keyof InsuranceFormErrors]: undefined }));
    }
  };

  const validateInsuranceForm = (): boolean => {
    const newErrors: InsuranceFormErrors = {};
    if (!insuranceForm.workId) {
      newErrors.workId = "Please select an eligible public work.";
    }
    if (!insuranceForm.insuranceAgentName.trim()) {
      newErrors.insuranceAgentName = "Insurance agent name is required.";
    }
    const trimmedPhone = insuranceForm.mobileNumber.trim();
    if (!trimmedPhone) {
      newErrors.mobileNumber = "Mobile number is required.";
    } else {
      const rawDigits = trimmedPhone.replace(/\D/g, "");
      if (rawDigits.length < 10 || rawDigits.length > 15 || !/^\+?[0-9\s\-()]{10,20}$/.test(trimmedPhone)) {
        newErrors.mobileNumber = "Enter a valid 10-15 digit mobile number.";
      }
    }
    if (!insuranceForm.loaSentDate) {
      newErrors.loaSentDate = "LOA sent date is required.";
    }
    const feeNum = parseFloat(insuranceForm.insuranceFee);
    if (isNaN(feeNum) || feeNum <= 0) {
      newErrors.insuranceFee = "Insurance fee must be a positive number greater than 0.";
    }
    if (insuranceForm.insuranceReceivedDate && insuranceForm.loaSentDate) {
      const loa = new Date(insuranceForm.loaSentDate);
      const rec = new Date(insuranceForm.insuranceReceivedDate);
      if (rec < loa) {
        newErrors.insuranceReceivedDate = "Received date cannot be earlier than LOA sent date.";
      }
    }
    setInsuranceErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInsuranceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setInsuranceErrors((prev) => ({
        ...prev,
        file: "File size exceeds 10MB limit. Please upload a smaller document.",
      }));
      e.target.value = "";
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext || "")) {
      setInsuranceErrors((prev) => ({
        ...prev,
        file: "Invalid file format. Only PDF, JPG, PNG, and WebP documents are supported.",
      }));
      e.target.value = "";
      return;
    }

    setInsuranceErrors((prev) => ({ ...prev, file: undefined }));
    setSelectedInsuranceFile(file);
    setInsuranceField("documentName", file.name);
    setInsuranceField("documentSize", file.size);
  };

  const clearInsuranceFile = () => {
    setSelectedInsuranceFile(null);
    setInsuranceField("documentName", "");
    setInsuranceField("documentPath", "");
    setInsuranceField("documentMimeType", "");
    setInsuranceField("documentSize", null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFileToServer = (
    file: File,
    workId?: string,
    category?: string,
    onProgress?: (info: UploadProgressInfo) => void
  ): Promise<{
    document: {
      documentName: string;
      documentPath: string;
      documentMimeType: string;
      documentSize: number;
    };
    record?: PublicWorksDocument | null;
  }> => {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      let uploadFinishedTime = 0;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/insurance/upload");
      xhr.timeout = 60000; // 60s safety timeout for multi-MB files

      if (onProgress) {
        onProgress({
          percent: 0,
          loadedBytes: 0,
          totalBytes: file.size,
          statusText: "Preparing upload...",
          stage: 'preparing',
        });
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          if (percent >= 99) {
            uploadFinishedTime = performance.now();
            onProgress({
              percent: 99,
              loadedBytes: event.loaded,
              totalBytes: event.total,
              statusText: "Saving chunks to persistent storage...",
              stage: 'processing',
            });
          } else {
            onProgress({
              percent,
              loadedBytes: event.loaded,
              totalBytes: event.total,
              statusText: `Uploading: ${percent}% (${formatFileSize(event.loaded)} / ${formatFileSize(event.total)})`,
              stage: 'uploading',
            });
          }
        }
      };

      xhr.upload.onload = () => {
        if (!uploadFinishedTime) uploadFinishedTime = performance.now();
      };

      xhr.onload = () => {
        const totalMs = performance.now() - startTime;
        const uploadMs = (uploadFinishedTime || performance.now()) - startTime;
        const serverWaitMs = Math.max(0, totalMs - uploadMs);

        // Safe timing measurement without sensitive info
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        console.info(
          `[DOC_UPLOAD] file="${safeName}" sizeBytes=${file.size} totalMs=${totalMs.toFixed(1)} (uploadMs=${uploadMs.toFixed(1)}, serverWaitMs=${serverWaitMs.toFixed(1)})`
        );

        let data: any = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          // Malformed or non-JSON response (e.g. 405 Method Not Allowed, 502/504 Bad Gateway / Gateway Timeout)
          const cleanSnippet = xhr.responseText
            ? xhr.responseText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)
            : '';
          data = {
            error: cleanSnippet || `Server error (${xhr.status}): ${xhr.statusText || 'Invalid response'}`,
          };
        }

        if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
          if (onProgress) {
            onProgress({
              percent: 100,
              loadedBytes: file.size,
              totalBytes: file.size,
              statusText: "Upload complete!",
              stage: 'complete',
            });
          }
          resolve(data);
        } else {
          const errMsg = data?.error || `Upload failed (HTTP ${xhr.status}${xhr.statusText ? `: ${xhr.statusText}` : ''})`;
          if (onProgress) {
            onProgress({
              percent: 0,
              loadedBytes: 0,
              totalBytes: file.size,
              statusText: errMsg,
              stage: 'error',
            });
          }
          reject(new Error(errMsg));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error during document upload. Please check your connection."));
      };

      xhr.ontimeout = () => {
        reject(new Error("Upload timed out after 60 seconds. Please try again."));
      };

      const formData = new FormData();
      formData.append("file", file);
      if (workId) formData.append("workId", workId);
      if (category) formData.append("category", category);

      xhr.send(formData);
    });
  };

  const handleInsuranceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (isSubmittingInsuranceRef.current || isInsuranceSaving || isInsuranceUploading) {
      return;
    }

    if (!validateInsuranceForm()) {
      toast.error("Validation Error", "Please review the highlighted fields in the form.");
      return;
    }

    isSubmittingInsuranceRef.current = true;
    setIsInsuranceSaving(true);
    let newlyUploadedDocPath: string | null = null;
    try {
      let docName = insuranceForm.documentName;
      let docPath = insuranceForm.documentPath;
      let docMime = insuranceForm.documentMimeType;
      let docSize = insuranceForm.documentSize;

      if (selectedInsuranceFile) {
        setIsInsuranceUploading(true);
        const uploadRes = await uploadFileToServer(selectedInsuranceFile);
        const uploaded = uploadRes.document;
        docName = uploaded.documentName;
        docPath = uploaded.documentPath;
        docMime = uploaded.documentMimeType;
        docSize = uploaded.documentSize;
        newlyUploadedDocPath = uploaded.documentPath;
        setIsInsuranceUploading(false);
      }

      const selectedWork = entries.find((en) => en.id === insuranceForm.workId);

      const payload = {
        workId: insuranceForm.workId,
        workName: selectedWork ? selectedWork.workName : "",
        workReferenceNo: selectedWork?.agreementNo || null,
        insuranceAgentName: insuranceForm.insuranceAgentName.trim(),
        mobileNumber: insuranceForm.mobileNumber.trim(),
        loaSentDate: new Date(insuranceForm.loaSentDate),
        insuranceFee: parseFloat(insuranceForm.insuranceFee),
        insuranceReceivedDate: insuranceForm.insuranceReceivedDate ? new Date(insuranceForm.insuranceReceivedDate) : null,
        documentName: docName || null,
        documentPath: docPath || null,
        documentMimeType: docMime || null,
        documentSize: docSize || null,
      };

      try {
        if (editingInsuranceId) {
          const updated = await onUpdateInsurance(editingInsuranceId, payload);
          if (onOptimisticUpdate && updated) {
            onOptimisticUpdate(updated);
          }
          if (selectedInsuranceFile && newlyUploadedDocPath) {
            blobCacheRef.current.set(`ins-doc-${updated?.id || editingInsuranceId}`, {
              blob: selectedInsuranceFile,
              mimeType: docMime || 'application/pdf',
              fileName: docName,
              cachedAt: Date.now(),
            });
          }
          toast.success("Insurance Updated", "Insurance record updated successfully.");
        } else {
          const created = await onCreateInsurance(payload);
          if (onOptimisticUpdate && created) {
            onOptimisticUpdate(created);
          }
          if (created && selectedInsuranceFile && newlyUploadedDocPath) {
            blobCacheRef.current.set(`ins-doc-${created.id}`, {
              blob: selectedInsuranceFile,
              mimeType: docMime || 'application/pdf',
              fileName: docName,
              cachedAt: Date.now(),
            });
          }
          toast.success("Insurance Saved", "Public works insurance record created successfully.");
        }
      } catch (saveError) {
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
      if (onRefreshDocuments) await onRefreshDocuments();
      handleCancelInsurance();
    } catch (err: unknown) {
      console.error("Failed to save insurance:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred while saving.";
      toast.error("Save Failed", message);
    } finally {
      isSubmittingInsuranceRef.current = false;
      setIsInsuranceSaving(false);
      setIsInsuranceUploading(false);
    }
  };

  const handleInsuranceEdit = (rec: PublicWorksInsurance) => {
    setEditingInsuranceId(rec.id);
    setSelectedInsuranceFile(null);
    setInsuranceForm({
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
    setInsuranceErrors({});
    setShowInsuranceForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelInsurance = () => {
    setShowInsuranceForm(false);
    setEditingInsuranceId(null);
    setSelectedInsuranceFile(null);
    setInsuranceForm(INITIAL_INSURANCE_FORM);
    setInsuranceErrors({});
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleInsuranceDelete = async (rec: PublicWorksInsurance) => {
    if (!onDeleteInsurance) return;
    if (window.confirm(`Are you sure you want to delete the insurance record for "${rec.workName}"? Stored policy documents will also be permanently removed.`)) {
      try {
        await onDeleteInsurance(rec.id);
        if (onOptimisticDelete) {
          onOptimisticDelete(rec.id);
        }
        toast.success("Insurance Deleted", "Insurance record and associated documents deleted.");
        if (onRefresh) await onRefresh();
        if (onRefreshDocuments) await onRefreshDocuments();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to delete insurance record.";
        toast.error("Delete Failed", msg);
      }
    }
  };

  // ── DOCUMENT REPOSITORY ACTIONS ────────────────────────────────────────────
  const handleDocFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setDocUploadErrors((prev) => ({
        ...prev,
        file: "File size exceeds 10MB limit. Please upload a smaller document.",
      }));
      e.target.value = "";
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png", "webp"].includes(ext || "")) {
      setDocUploadErrors((prev) => ({
        ...prev,
        file: "Invalid file format. Only PDF, JPG, PNG, and WebP are supported.",
      }));
      e.target.value = "";
      return;
    }

    setDocUploadErrors((prev) => ({ ...prev, file: undefined }));
    setDocUploadFile(file);
  };

  const handleUploadDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submissions
    if (isSubmittingDocRef.current || isDocUploading) {
      return;
    }

    setDocUploadErrorBanner(null);
    setDocUploadSuccessBanner(null);

    const errors: { workId?: string; category?: string; file?: string } = {};
    if (!docUploadWorkId) {
      errors.workId = "Please select a public work.";
    }
    if (!docUploadCategory) {
      errors.category = "Please select a document category.";
    }
    if (!docUploadFile) {
      errors.file = "Please choose a document file to upload.";
    }

    if (Object.keys(errors).length > 0) {
      setDocUploadErrors(errors);
      return;
    }

    isSubmittingDocRef.current = true;
    setIsDocUploading(true);
    let newlyUploadedPath: string | null = null;
    try {
      const selectedWork = entries.find((w) => w.id === docUploadWorkId);
      if (!selectedWork) {
        throw new Error("Selected public work was not found.");
      }

      // Single Round-Trip Upload: Uploads binary file AND creates PublicWorksDocument record on server
      const uploadRes = await uploadFileToServer(
        docUploadFile!,
        docUploadWorkId,
        docUploadCategory,
        (info) => {
          setDocUploadProgress(info);
        }
      );
      const uploadedDoc = uploadRes.document;
      newlyUploadedPath = uploadedDoc.documentPath;
      let createdDoc = uploadRes.record;

      // Fallback if record was not created directly by upload API route
      if (!createdDoc) {
        setDocUploadProgress({
          percent: 99,
          loadedBytes: docUploadFile!.size,
          totalBytes: docUploadFile!.size,
          statusText: "Finalizing document record...",
          stage: 'processing',
        });
        const docPayload = {
          workId: docUploadWorkId,
          category: docUploadCategory,
          fileName: uploadedDoc.documentName,
          fileSize: uploadedDoc.documentSize,
          mimeType: uploadedDoc.documentMimeType,
          documentPath: uploadedDoc.documentPath,
        };

        if (onCreateDocument) {
          createdDoc = await onCreateDocument(docPayload);
        } else {
          const res = await fetch("/api/insurance/work-documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(docPayload),
          });
          const resData = await parseResponseSafely(res);
          if (!res.ok || !resData?.success) {
            throw new Error(resData?.error || `Failed to create document record (HTTP ${res.status})`);
          }
          createdDoc = resData.data;
        }
      }

      if (createdDoc && docUploadFile) {
        if (onOptimisticUpdateDocument) {
          onOptimisticUpdateDocument(createdDoc);
        }
        // Cache the raw File (Blob) in client memory so opening/viewing is instantaneous (0ms)
        try {
          blobCacheRef.current.set(createdDoc.id, {
            blob: docUploadFile,
            mimeType: uploadedDoc.documentMimeType,
            fileName: uploadedDoc.documentName,
            cachedAt: Date.now(),
          });
        } catch {}
      }

      setDocUploadSuccessBanner(`"${uploadedDoc.documentName}" uploaded successfully!`);

      toast.success(
        "Document Uploaded",
        `Successfully uploaded "${uploadedDoc.documentName}" under ${getCategoryBadge(docUploadCategory).label}.`
      );

      // Brief delay so user sees 100% complete state before modal closes
      await new Promise((r) => setTimeout(r, 450));

      // Close upload modal immediately and reset state
      setShowDocUploadModal(false);
      setDocUploadWorkId("");
      setDocUploadCategory("TAR_BILL");
      setDocUploadFile(null);
      setDocUploadErrors({});
      setDocUploadProgress(null);
      setDocUploadSuccessBanner(null);
      if (docFileInputRef.current) {
        docFileInputRef.current.value = "";
      }

      // Only refresh document list if the created record was not returned directly
      if (!createdDoc && onRefreshDocuments) {
        Promise.resolve(onRefreshDocuments()).catch((err) => {
          console.error("Background document refresh error:", err);
        });
      }
    } catch (err: unknown) {
      console.error("Document upload failed:", err);
      if (newlyUploadedPath) {
        fetch("/api/insurance/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentPath: newlyUploadedPath }),
        }).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : "Failed to upload document.";
      setDocUploadErrorBanner(msg);
      toast.error("Upload Failed", msg);
    } finally {
      isSubmittingDocRef.current = false;
      setIsDocUploading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteConfirmDoc) return;
    setIsDeletingDoc(true);
    try {
      if (onDeleteDocument) {
        await onDeleteDocument(deleteConfirmDoc.id);
      } else {
        const res = await fetch(`/api/insurance/work-documents/${deleteConfirmDoc.id}`, {
          method: "DELETE",
        });
        const resData = await parseResponseSafely(res);
        if (!res.ok || !resData?.success) {
          throw new Error(resData?.error || `Failed to delete document (HTTP ${res.status})`);
        }
      }

      // Purge from client in-memory cache as well
      blobCacheRef.current.delete(deleteConfirmDoc.id);

      if (onOptimisticDeleteDocument) {
        onOptimisticDeleteDocument(deleteConfirmDoc.id);
      }

      toast.success("Document Deleted", `"${deleteConfirmDoc.fileName}" deleted successfully.`);
      setDeleteConfirmDoc(null);
      if (onRefreshDocuments) await onRefreshDocuments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete document.";
      toast.error("Delete Failed", msg);
    } finally {
      setIsDeletingDoc(false);
    }
  };

  // ── FILTERED RECORDS ───────────────────────────────────────────────────────
  // Filtered Insurance Records
  const filteredInsuranceRecords = useMemo(() => {
    return insuranceRecords.filter((rec) => {
      if (rec.deletedAt) return false;
      if (insuranceStatusFilter === "RECEIVED" && !rec.insuranceReceivedDate) return false;
      if (insuranceStatusFilter === "PENDING" && Boolean(rec.insuranceReceivedDate)) return false;

      if (insuranceSearchQuery.trim()) {
        const q = insuranceSearchQuery.toLowerCase();
        const matchesWork = (rec.workName || "").toLowerCase().includes(q);
        const matchesRef = (rec.workReferenceNo || "").toLowerCase().includes(q);
        const matchesAgent = (rec.insuranceAgentName || "").toLowerCase().includes(q);
        const matchesMobile = (rec.mobileNumber || "").includes(q);
        if (!matchesWork && !matchesRef && !matchesAgent && !matchesMobile) return false;
      }
      return true;
    });
  }, [insuranceRecords, insuranceStatusFilter, insuranceSearchQuery]);

  const totalInsurancePages = Math.max(1, Math.ceil(filteredInsuranceRecords.length / insuranceItemsPerPage));
  const paginatedInsuranceRecords = useMemo(() => {
    const start = (insuranceCurrentPage - 1) * insuranceItemsPerPage;
    return filteredInsuranceRecords.slice(start, start + insuranceItemsPerPage);
  }, [filteredInsuranceRecords, insuranceCurrentPage]);

  // Filtered Documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (doc.deletedAt) return false;

      // Work filter
      if (selectedWorkFilter !== "ALL" && doc.workId !== selectedWorkFilter) {
        return false;
      }

      // Category filter
      if (selectedCategoryFilter !== "ALL") {
        const docCatNorm = (doc.category || "").toUpperCase().replace(/[\s-]/g, "_");
        const filterCatNorm = selectedCategoryFilter.toUpperCase().replace(/[\s-]/g, "_");
        if (docCatNorm !== filterCatNorm) {
          return false;
        }
      }

      // Search query
      if (documentSearchQuery.trim()) {
        const q = documentSearchQuery.toLowerCase();
        const matchesFile = (doc.fileName || "").toLowerCase().includes(q);
        const matchesWork = (doc.workName || "").toLowerCase().includes(q);
        const matchesUploader = (doc.uploaderName || doc.uploaderEmail || "").toLowerCase().includes(q);
        if (!matchesFile && !matchesWork && !matchesUploader) return false;
      }

      return true;
    });
  }, [documents, selectedWorkFilter, selectedCategoryFilter, documentSearchQuery]);

  const totalDocPages = Math.max(1, Math.ceil(filteredDocuments.length / docItemsPerPage));
  const paginatedDocuments = useMemo(() => {
    const start = (docCurrentPage - 1) * docItemsPerPage;
    return filteredDocuments.slice(start, start + docItemsPerPage);
  }, [filteredDocuments, docCurrentPage]);

  return (
    <div className="space-y-6 pb-12">
      {/* Enterprise Document Print Header */}
      <div className="hidden print:block text-center border-b pb-4 mb-4">
        <h2 className="text-xl font-bold uppercase tracking-wider">Aravind Associates</h2>
        <p className="text-xs text-neutral-600">Public Works Documents Register</p>
      </div>

      {/* Top Header & Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-black text-white rounded">
              <Files className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-black">
              Public Works Documents
            </h1>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Manage contract documents (Tar Bill, Security, Estimate, Site Plan) and mandatory insurance policies for active public works contracts.
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <button
            onClick={() => {
              setDocUploadErrors({});
              setDocUploadFile(null);
              setDocUploadCategory("TAR_BILL");
              setDocUploadWorkId(eligibleStartedWorks[0]?.id || "");
              setShowDocUploadModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer transition-colors shadow-xs"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>

          {!showInsuranceForm && (
            <button
              onClick={() => {
                setEditingInsuranceId(null);
                setInsuranceForm(INITIAL_INSURANCE_FORM);
                setSelectedInsuranceFile(null);
                setInsuranceErrors({});
                setShowInsuranceForm(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white text-black hover:bg-neutral-100 border border-neutral-300 text-xs font-semibold rounded cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Record Insurance</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:grid-cols-5">
        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
            Total Documents
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-black">
            {metrics.totalDocs}
          </div>
          <span className="text-[10px] text-neutral-400">Stored contract files</span>
        </div>

        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
            Total Policies
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-black">
            {metrics.totalPolicies}
          </div>
          <span className="text-[10px] text-neutral-400">Registered public policies</span>
        </div>

        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-neutral-500 tracking-wider">
            Insurance Outlay
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-black">
            ₹{metrics.totalFees.toLocaleString("en-IN")}
          </div>
          <span className="text-[10px] text-neutral-400">Total premium amount</span>
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

        <div className="border border-neutral-200 bg-white p-3.5 rounded shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold uppercase text-amber-600 tracking-wider">
            Document Pending
          </span>
          <div className="text-xl font-mono font-bold mt-1 text-amber-600">
            {metrics.pendingCount}
          </div>
          <span className="text-[10px] text-neutral-400">Awaiting policy certificate</span>
        </div>
      </div>

      {/* ── SECTION 1: DOCUMENT MANAGEMENT REPOSITORY ────────────────────── */}
      <div className="border border-neutral-200 bg-white rounded-lg overflow-hidden shadow-2xs">
        {/* Document Filter & Control Bar */}
        <div className="p-3.5 sm:p-4 border-b border-neutral-200 bg-neutral-50/70 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-black shrink-0" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-black truncate">
                Public Works Document Management
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full md:w-auto">
              {/* Work Selection Dropdown */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-[10px] font-bold uppercase text-neutral-500 whitespace-nowrap shrink-0">
                  Work:
                </span>
                <select
                  value={selectedWorkFilter}
                  onChange={(e) => {
                    setSelectedWorkFilter(e.target.value);
                    setDocCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white w-full sm:w-56 md:w-64"
                >
                  <option value="ALL">All Public Works</option>
                  {eligibleStartedWorks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.workName} {w.agreementNo ? `(${w.agreementNo})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search by Work Name / File Name */}
              <div className="relative w-full sm:w-60 md:w-64">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search by file or work..."
                  value={documentSearchQuery}
                  onChange={(e) => {
                    setDocumentSearchQuery(e.target.value);
                    setDocCurrentPage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white w-full"
                />
              </div>
            </div>
          </div>

          {/* Document Category Filters / Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 text-xs -mx-1 px-1 sm:mx-0 sm:px-0">
            <span className="text-[10px] font-bold uppercase text-neutral-500 mr-1 shrink-0">
              Categories:
            </span>
            {DOCUMENT_CATEGORIES.map((cat) => {
              const count = documents.filter((d) => {
                if (d.deletedAt) return false;
                if (selectedWorkFilter !== "ALL" && d.workId !== selectedWorkFilter) return false;
                if (cat.id === "ALL") return true;
                const dNorm = (d.category || "").toUpperCase().replace(/[\s-]/g, "_");
                return dNorm === cat.id;
              }).length;

              const isSelected = selectedCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategoryFilter(cat.id);
                    setDocCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
                    isSelected
                      ? "bg-black text-white border-black shadow-xs"
                      : "bg-white text-neutral-700 hover:bg-neutral-100 border-neutral-200"
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? "bg-neutral-800 text-white"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── MOBILE & TABLET CARD VIEW (< 1024px) ────────────────────────── */}
        <div className="block lg:hidden divide-y divide-neutral-200 bg-white">
          {paginatedDocuments.map((doc) => {
            const categoryBadge = getCategoryBadge(doc.category);
            const isImage = (doc.mimeType || "").startsWith("image/");
            const isPdf = (doc.mimeType || "").includes("pdf");

            return (
              <div
                key={`mobile-doc-${doc.id}`}
                className="p-3.5 sm:p-4 hover:bg-neutral-50/70 transition-colors space-y-2.5"
              >
                {/* Top Row: Public Work & Category Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase text-neutral-400 block tracking-wider leading-none mb-1">
                      Public Work
                    </span>
                    <h4 className="text-xs font-bold text-black leading-snug break-words">
                      {doc.workName}
                    </h4>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${categoryBadge.badgeClass}`}
                  >
                    {categoryBadge.label}
                  </span>
                </div>

                {/* File Details: Icon, Name (wrapped/readable), Size, Date, Format */}
                <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50/80 rounded-md border border-neutral-200">
                  <div className="mt-0.5 shrink-0">
                    {isImage ? (
                      <ImageIcon className="w-4 h-4 text-blue-600" />
                    ) : isPdf ? (
                      <FileText className="w-4 h-4 text-red-600" />
                    ) : (
                      <FileText className="w-4 h-4 text-neutral-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-semibold text-black break-words [overflow-wrap:anywhere] leading-tight"
                      title={doc.fileName}
                    >
                      {doc.fileName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[10px] text-neutral-500 font-mono">
                      <span className="px-1.5 py-0.2 bg-white rounded border border-neutral-200 font-semibold text-neutral-700">
                        {isPdf ? "PDF" : isImage ? (doc.fileName.split('.').pop()?.toUpperCase() || "IMAGE") : "DOC"}
                      </span>
                      <span>•</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>•</span>
                      <span>{formatDateDisplay(doc.createdAt)}</span>
                      {doc.uploaderName && (
                        <>
                          <span>•</span>
                          <span className="font-sans text-neutral-600">By {doc.uploaderName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons: Full Width / Comfortably Sized */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      type="button"
                      onClick={() => handleOpenDocumentPreview(doc)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-white border border-neutral-300 hover:border-black rounded text-xs font-semibold text-neutral-900 hover:text-black cursor-pointer transition-colors shadow-2xs min-h-[34px]"
                      title="View Document"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownloadDocument(doc)}
                      className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded text-xs font-semibold text-black cursor-pointer transition-colors min-h-[34px]"
                      title="Download Original File"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>

                  {onDeleteDocument && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmDoc(doc)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors shrink-0 min-h-[34px] min-w-[34px] flex items-center justify-center"
                      title="Delete Document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {paginatedDocuments.length === 0 && (
            <div className="p-8 text-center text-neutral-400">
              <Files className="w-8 h-8 stroke-[1.5] mb-2 mx-auto text-neutral-300" />
              <p className="text-xs font-semibold text-neutral-600">No documents found.</p>
              <p className="text-[11px] text-neutral-400 mt-1 max-w-xs mx-auto">
                {documentSearchQuery || selectedWorkFilter !== "ALL" || selectedCategoryFilter !== "ALL"
                  ? "Try adjusting your filters or search term."
                  : "Upload contract documents using the Upload Document button."}
              </p>
            </div>
          )}
        </div>

        {/* ── DESKTOP TABLE VIEW (>= 1024px) ───────────────────────────────── */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-100 border-b border-neutral-200 font-bold uppercase text-[9px] text-neutral-500 tracking-wider">
                <th className="p-3">Associated Public Work</th>
                <th className="p-3">Document Category</th>
                <th className="p-3">Document Name</th>
                <th className="p-3">Format / MIME</th>
                <th className="p-3 text-right">File Size</th>
                <th className="p-3">Upload Date</th>
                <th className="p-3">Uploader</th>
                <th className="p-3 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {paginatedDocuments.map((doc) => {
                const categoryBadge = getCategoryBadge(doc.category);
                const isImage = (doc.mimeType || "").startsWith("image/");
                const isPdf = (doc.mimeType || "").includes("pdf");

                return (
                  <tr key={`desktop-doc-${doc.id}`} className="hover:bg-neutral-50/80 transition-colors">
                    {/* Public Work */}
                    <td className="p-3 font-semibold text-black">
                      <div className="flex flex-col">
                        <span>{doc.workName}</span>
                        <span className="text-[10px] text-neutral-400 font-normal">Public Work</span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${categoryBadge.badgeClass}`}>
                        {categoryBadge.label}
                      </span>
                    </td>

                    {/* Document Name */}
                    <td className="p-3 font-medium text-black">
                      <div className="flex items-center gap-2">
                        {isImage ? (
                          <ImageIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        ) : isPdf ? (
                          <FileText className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                        )}
                        <span className="truncate max-w-[200px] xl:max-w-[320px] inline-block" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                      </div>
                    </td>

                    {/* Format / MIME */}
                    <td className="p-3 font-mono text-[11px] text-neutral-600">
                      <span className="px-1.5 py-0.5 bg-neutral-100 rounded text-[10px] border border-neutral-200">
                        {isPdf ? "PDF" : isImage ? (doc.fileName.split('.').pop()?.toUpperCase() || "IMAGE") : "DOC"}
                      </span>
                    </td>

                    {/* File Size */}
                    <td className="p-3 text-right font-mono text-neutral-700">
                      {formatFileSize(doc.fileSize)}
                    </td>

                    {/* Upload Date */}
                    <td className="p-3 font-mono text-neutral-700">
                      {formatDateDisplay(doc.createdAt)}
                    </td>

                    {/* Uploader Identity */}
                    <td className="p-3 text-neutral-600 font-sans truncate max-w-[140px]" title={doc.uploaderName || doc.uploaderEmail || ""}>
                      {doc.uploaderName || doc.uploaderEmail || "System"}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-right print:hidden">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDocumentPreview(doc)}
                          className="px-2 py-1 bg-white border border-neutral-200 hover:border-black rounded text-[11px] font-semibold text-neutral-800 hover:text-black flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                          title="View Document"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={() => handleDownloadDocument(doc)}
                          className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded text-[11px] font-semibold text-black flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                          title="Download Original File"
                        >
                          <FileDown className="w-3 h-3" />
                          <span>Download</span>
                        </button>

                        {onDeleteDocument && (
                          <button
                            onClick={() => setDeleteConfirmDoc(doc)}
                            className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition-colors shrink-0"
                            title="Delete Document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paginatedDocuments.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center text-neutral-400">
                      <Files className="w-10 h-10 stroke-[1.5] mb-2 text-neutral-300" />
                      <p className="text-sm font-semibold text-neutral-600">
                        No documents found.
                      </p>
                      <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                        {documentSearchQuery || selectedWorkFilter !== "ALL" || selectedCategoryFilter !== "ALL"
                          ? "Try adjusting your filters or search term."
                          : "Upload contract documents (Tar Bill, Security, Estimate, Site Plan, Insurance) using the Upload Document button."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Documents Pagination Footer */}
        {totalDocPages > 1 && (
          <div className="p-3 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-neutral-500 bg-neutral-50/50 print:hidden">
            <span className="text-center sm:text-left">
              Showing {(docCurrentPage - 1) * docItemsPerPage + 1} to{" "}
              {Math.min(docCurrentPage * docItemsPerPage, filteredDocuments.length)} of{" "}
              {filteredDocuments.length} documents
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setDocCurrentPage((p) => Math.max(1, p - 1))}
                disabled={docCurrentPage === 1}
                className="p-1.5 border border-neutral-300 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] font-semibold text-neutral-700">
                Page {docCurrentPage} of {totalDocPages}
              </span>
              <button
                onClick={() => setDocCurrentPage((p) => Math.min(totalDocPages, p + 1))}
                disabled={docCurrentPage === totalDocPages}
                className="p-1.5 border border-neutral-300 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: INSURANCE POLICIES & COVERAGE ─────────────────────── */}
      <div className="space-y-4">
        {/* Insurance Form (When Recording or Editing) */}
        {showInsuranceForm && (
          <form
            onSubmit={handleInsuranceSubmit}
            className="border border-neutral-300 bg-neutral-50/70 p-5 rounded-lg space-y-4 shadow-sm animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-black" />
                <span className="font-bold text-xs uppercase tracking-wider text-black">
                  {editingInsuranceId ? "Edit Insurance Record" : "New Public Works Insurance Record"}
                </span>
                <span className="text-[10px] text-neutral-500 border border-neutral-300 rounded px-1.5 py-0.5 bg-white">
                  Public Works Only
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelInsurance}
                className="text-neutral-400 hover:text-black p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Work Name Dropdown */}
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Work Name <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={insuranceForm.workId}
                  onChange={(e) => setInsuranceField("workId", e.target.value)}
                  className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                    insuranceErrors.workId ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                >
                  <option value="">-- Select Eligible Public Work (Started Only) --</option>
                  {eligibleWorksForInsurance.map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.workName} {work.agreementNo ? `(Agr. No: ${work.agreementNo})` : ""} — Status: {work.status}
                    </option>
                  ))}
                </select>
                {insuranceErrors.workId && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.workId}
                  </p>
                )}
              </div>

              {/* Insurance Agent Name */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Insurance Agent Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Agent or Agency Name"
                  value={insuranceForm.insuranceAgentName}
                  onChange={(e) => setInsuranceField("insuranceAgentName", e.target.value)}
                  className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                    insuranceErrors.insuranceAgentName ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                />
                {insuranceErrors.insuranceAgentName && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.insuranceAgentName}
                  </p>
                )}
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +91 9876543210"
                  value={insuranceForm.mobileNumber}
                  onChange={(e) => setInsuranceField("mobileNumber", e.target.value)}
                  className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white font-mono transition-colors ${
                    insuranceErrors.mobileNumber ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                />
                {insuranceErrors.mobileNumber && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.mobileNumber}
                  </p>
                )}
              </div>

              {/* LOA Sent Date */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  LOA Sent Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={insuranceForm.loaSentDate}
                  onChange={(e) => setInsuranceField("loaSentDate", e.target.value)}
                  className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                    insuranceErrors.loaSentDate ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                />
                {insuranceErrors.loaSentDate && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.loaSentDate}
                  </p>
                )}
              </div>

              {/* Insurance Fee */}
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
                    value={insuranceForm.insuranceFee}
                    onChange={(e) => setInsuranceField("insuranceFee", e.target.value)}
                    className={`w-full pl-7 pr-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white font-mono transition-colors ${
                      insuranceErrors.insuranceFee ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                    }`}
                  />
                </div>
                {insuranceErrors.insuranceFee && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.insuranceFee}
                  </p>
                )}
              </div>

              {/* Insurance Received Date */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Insurance Received Date <span className="text-neutral-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={insuranceForm.insuranceReceivedDate}
                  onChange={(e) => setInsuranceField("insuranceReceivedDate", e.target.value)}
                  className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white transition-colors ${
                    insuranceErrors.insuranceReceivedDate ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                />
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  Leave empty if policy has not yet been received.
                </span>
                {insuranceErrors.insuranceReceivedDate && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.insuranceReceivedDate}
                  </p>
                )}
              </div>

              {/* Policy Document Upload */}
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Upload Policy Document <span className="text-neutral-400 font-normal">(PDF, JPG, PNG, WebP — Max 10MB)</span>
                </label>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={handleInsuranceFileChange}
                    className="hidden"
                    id="insurance-doc-input"
                  />

                  <label
                    htmlFor="insurance-doc-input"
                    className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-neutral-400 hover:border-black rounded text-xs font-semibold cursor-pointer text-neutral-700 hover:text-black bg-white transition-colors shrink-0"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{insuranceForm.documentName ? "Replace Document" : "Choose Document"}</span>
                  </label>

                  {insuranceForm.documentName && (
                    <div className="flex-1 flex items-center justify-between px-3 py-1.5 bg-neutral-100 border border-neutral-200 rounded text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-neutral-600 shrink-0" />
                        <span className="font-medium text-black truncate">{insuranceForm.documentName}</span>
                        {insuranceForm.documentSize && (
                          <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                            ({formatFileSize(insuranceForm.documentSize)})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={clearInsuranceFile}
                        className="text-neutral-400 hover:text-red-600 p-1 shrink-0 ml-2"
                        title="Remove document"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {insuranceErrors.file && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {insuranceErrors.file}
                  </p>
                )}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
              <button
                type="button"
                onClick={handleCancelInsurance}
                disabled={isInsuranceSaving}
                className="px-3.5 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isInsuranceSaving || isInsuranceUploading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer transition-colors disabled:opacity-50 shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {isInsuranceUploading
                    ? "Uploading..."
                    : isInsuranceSaving
                    ? "Saving..."
                    : editingInsuranceId
                    ? "Update Insurance"
                    : "Save Insurance"}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Insurance Records Table */}
        <div className="border border-neutral-200 bg-white rounded-lg overflow-hidden shadow-2xs">
          <div className="p-3.5 border-b border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-50/50 print:hidden">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-black" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-black">
                Public Works Insurance Policies
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Search Box */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search insurance policies..."
                  value={insuranceSearchQuery}
                  onChange={(e) => {
                    setInsuranceSearchQuery(e.target.value);
                    setInsuranceCurrentPage(1);
                  }}
                  className="pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white w-full sm:w-56"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1 text-xs">
                {(["ALL", "RECEIVED", "PENDING"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setInsuranceStatusFilter(filter);
                      setInsuranceCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                      insuranceStatusFilter === filter
                        ? "bg-black text-white"
                        : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200"
                    }`}
                  >
                    {filter === "ALL" ? "All" : filter === "RECEIVED" ? "Received" : "Pending"}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
                  <th className="p-3 text-center">Policy Document</th>
                  <th className="p-3 text-right print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {paginatedInsuranceRecords.map((rec) => {
                  const isReceived = Boolean(rec.insuranceReceivedDate);
                  return (
                    <tr key={rec.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="p-3 font-semibold text-black">
                        <div className="flex flex-col">
                          <span>{rec.workName}</span>
                          <span className="text-[10px] text-neutral-400 font-normal">Public Work</span>
                        </div>
                      </td>

                      <td className="p-3 font-mono text-neutral-700">
                        {rec.workReferenceNo || "—"}
                      </td>

                      <td className="p-3 text-black font-medium">
                        {rec.insuranceAgentName}
                      </td>

                      <td className="p-3 font-mono text-neutral-700">
                        <a href={`tel:${rec.mobileNumber}`} className="hover:underline hover:text-black">
                          {rec.mobileNumber}
                        </a>
                      </td>

                      <td className="p-3 font-mono text-neutral-700">
                        {formatDateDisplay(rec.loaSentDate)}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-black">
                        ₹{Number(rec.insuranceFee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

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

                      <td className="p-3 text-center">
                        {rec.documentPath ? (
                          <button
                            type="button"
                            onClick={() => handleOpenInsuranceDocPreview(rec)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 hover:text-black underline underline-offset-2 cursor-pointer"
                            title={rec.documentName || "View Policy Document"}
                          >
                            <FileText className="w-3.5 h-3.5 text-neutral-700" />
                            <span className="max-w-[120px] truncate">
                              {rec.documentName || "Document"}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-neutral-400 italic">
                            Not Uploaded
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right print:hidden">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewInsuranceRecord(rec)}
                            className="p-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                            title="View Policy Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleInsuranceEdit(rec)}
                            className="p-1.5 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded cursor-pointer transition-colors"
                            title="Edit Policy Record"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteInsurance && (
                            <button
                              onClick={() => handleInsuranceDelete(rec)}
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

                {paginatedInsuranceRecords.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-neutral-400">
                      <p className="text-xs font-semibold text-neutral-600">
                        {insuranceSearchQuery || insuranceStatusFilter !== "ALL"
                          ? "No matching insurance records found."
                          : "No public works insurance policies recorded yet."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalInsurancePages > 1 && (
            <div className="p-2.5 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-500 bg-neutral-50/50 print:hidden">
              <span>
                Showing {(insuranceCurrentPage - 1) * insuranceItemsPerPage + 1} to{" "}
                {Math.min(insuranceCurrentPage * insuranceItemsPerPage, filteredInsuranceRecords.length)} of{" "}
                {filteredInsuranceRecords.length} policies
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setInsuranceCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={insuranceCurrentPage === 1}
                  className="p-1 border border-neutral-300 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="px-2 font-mono text-[11px] font-semibold text-neutral-700">
                  Page {insuranceCurrentPage} of {totalInsurancePages}
                </span>
                <button
                  onClick={() => setInsuranceCurrentPage((p) => Math.min(totalInsurancePages, p + 1))}
                  disabled={insuranceCurrentPage === totalInsurancePages}
                  className="p-1 border border-neutral-300 rounded hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: DOCUMENT UPLOAD ────────────────────────────────────────── */}
      {showDocUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-black text-white">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <h3 className="font-bold text-xs uppercase tracking-wider">
                  Upload Public Works Document
                </h3>
              </div>
              <button
                onClick={() => {
                  if (!isDocUploading) {
                    setShowDocUploadModal(false);
                  }
                }}
                disabled={isDocUploading}
                className="text-neutral-400 hover:text-white p-1 disabled:opacity-30"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isDocUploading) return;
                handleUploadDocumentSubmit(e);
              }}
              className="p-5 space-y-4 text-xs"
            >
              {/* Work Selection */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Public Work <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={docUploadWorkId}
                  onChange={(e) => {
                    setDocUploadWorkId(e.target.value);
                    if (docUploadErrors.workId) {
                      setDocUploadErrors((prev) => ({ ...prev, workId: undefined }));
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-black text-black bg-white ${
                    docUploadErrors.workId ? "border-red-500 bg-red-50/30" : "border-neutral-300"
                  }`}
                >
                  <option value="">-- Select Active Public Work --</option>
                  {eligibleStartedWorks.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.workName} {w.agreementNo ? `(${w.agreementNo})` : ""} — Status: {w.status}
                    </option>
                  ))}
                </select>
                {docUploadErrors.workId && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {docUploadErrors.workId}
                  </p>
                )}
              </div>

              {/* Document Category Selection */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Document Category <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={docUploadCategory}
                  onChange={(e) => {
                    setDocUploadCategory(e.target.value);
                    if (docUploadErrors.category) {
                      setDocUploadErrors((prev) => ({ ...prev, category: undefined }));
                    }
                  }}
                  className="w-full px-3 py-2 border border-neutral-300 rounded text-xs focus:outline-none focus:border-black text-black bg-white"
                >
                  <option value="TAR_BILL">Tar Bill</option>
                  <option value="SECURITY">Security</option>
                  <option value="ESTIMATE">Estimate</option>
                  <option value="SITE_PLAN">Site Plan</option>
                  <option value="INSURANCE">Insurance</option>
                </select>
              </div>

              {/* File Upload Drop Zone */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                  Document File <span className="text-red-500">*</span>
                </label>
                <div className="border border-dashed border-neutral-300 rounded-lg p-4 text-center hover:border-black transition-colors bg-neutral-50/50">
                  <input
                    ref={docFileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={handleDocFileSelect}
                    className="hidden"
                    id="doc-upload-modal-input"
                  />
                  <label
                    htmlFor="doc-upload-modal-input"
                    className="cursor-pointer flex flex-col items-center justify-center gap-1"
                  >
                    <Upload className="w-6 h-6 text-neutral-400 mb-1" />
                    <span className="text-xs font-semibold text-neutral-800">
                      {docUploadFile ? docUploadFile.name : "Click to select document"}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      PDF, JPG, PNG, WebP (Max 10 MB)
                    </span>
                  </label>

                  {docUploadFile && (
                    <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-neutral-200 rounded text-xs font-mono">
                      <span>{formatFileSize(docUploadFile.size)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDocUploadFile(null);
                          if (docFileInputRef.current) docFileInputRef.current.value = "";
                        }}
                        className="text-neutral-400 hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {docUploadErrors.file && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3 h-3" />
                    {docUploadErrors.file}
                  </p>
                )}
              </div>

              {/* Real Upload Progress Bar */}
              {isDocUploading && docUploadProgress && (
                <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium text-neutral-800">
                    <span className="flex items-center gap-1.5 truncate">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black shrink-0" />
                      <span className="truncate">{docUploadProgress.statusText}</span>
                    </span>
                    <span className="font-mono font-bold text-black ml-2 text-xs">
                      {docUploadProgress.percent}%
                    </span>
                  </div>

                  {/* Progress Bar Container */}
                  <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ease-out ${
                        docUploadProgress.stage === 'complete'
                          ? 'bg-emerald-600'
                          : docUploadProgress.stage === 'processing'
                          ? 'bg-neutral-800 animate-pulse'
                          : 'bg-black'
                      }`}
                      style={{ width: `${Math.max(4, docUploadProgress.percent)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                    <span>
                      {formatFileSize(docUploadProgress.loadedBytes)} / {formatFileSize(docUploadProgress.totalBytes)}
                    </span>
                    <span>
                      {docUploadProgress.stage === 'processing'
                        ? 'Writing 2 MB chunks to Atlas...'
                        : docUploadProgress.stage === 'complete'
                        ? 'Upload Finished'
                        : 'Streaming upload'}
                    </span>
                  </div>
                </div>
              )}

              {/* Success Banner */}
              {docUploadSuccessBanner && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-150">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">{docUploadSuccessBanner}</span>
                </div>
              )}

              {/* Error Banner */}
              {docUploadErrorBanner && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-start gap-2 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Upload Failed</p>
                    <p className="text-[11px] text-red-700 mt-0.5">{docUploadErrorBanner}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDocUploadModal(false);
                    setDocUploadErrorBanner(null);
                    setDocUploadSuccessBanner(null);
                  }}
                  disabled={isDocUploading}
                  className="px-3.5 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDocUploading || !docUploadFile || !docUploadWorkId}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {isDocUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{docUploadProgress?.statusText || "Uploading..."}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: DOCUMENT PREVIEW / VIEWER ──────────────────────────────── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between bg-black text-white">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 shrink-0" />
                <div className="truncate">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs uppercase tracking-wider truncate">
                      {previewDoc.fileName}
                    </h3>
                    {previewIsFromCache && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono shrink-0">
                        ⚡ Cached (0ms)
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-normal">
                    {previewDoc.workName} • {getCategoryBadge(previewDoc.category).label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadDocument(previewDoc)}
                  className="px-2.5 py-1 bg-white text-black hover:bg-neutral-200 text-xs font-semibold rounded flex items-center gap-1 transition-colors cursor-pointer"
                  title="Download File"
                >
                  <FileDown className="w-3 h-3" />
                  <span>Download</span>
                </button>
                <button
                  onClick={handleCloseDocumentPreview}
                  className="text-neutral-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 bg-neutral-100/50 overflow-auto flex items-center justify-center min-h-[400px]">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center p-12 text-neutral-500 animate-in fade-in duration-150">
                  <Loader2 className="w-8 h-8 animate-spin text-black mb-3" />
                  <p className="text-xs font-semibold text-neutral-800">Opening document preview...</p>
                  <p className="text-[10px] text-neutral-400 mt-1">Retrieving persistent storage chunks and preparing preview</p>
                </div>
              ) : previewError ? (
                <div className="text-center p-8 bg-white rounded border border-neutral-200 max-w-md shadow-xs">
                  <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                  <p className="font-semibold text-sm text-neutral-800">Preview Error</p>
                  <p className="text-xs text-neutral-600 mt-1">{previewError}</p>
                  <button
                    onClick={() => previewDoc && handleOpenDocumentPreview(previewDoc)}
                    className="mt-4 px-3.5 py-1.5 bg-black text-white rounded text-xs font-semibold hover:bg-neutral-850 cursor-pointer"
                  >
                    Retry Preview
                  </button>
                </div>
              ) : (previewDoc.mimeType || "").includes("pdf") ? (
                <iframe
                  src={activePreviewUrl || `/api/insurance/documents/${previewDoc.id}`}
                  className="w-full h-[65vh] rounded border border-neutral-200 bg-white shadow-xs"
                  title={previewDoc.fileName}
                />
              ) : (previewDoc.mimeType || "").startsWith("image/") ? (
                <div className="max-h-[65vh] flex items-center justify-center p-2 bg-white rounded border border-neutral-200 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activePreviewUrl || `/api/insurance/documents/${previewDoc.id}`}
                    alt={previewDoc.fileName}
                    className="max-h-[60vh] max-w-full object-contain rounded"
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-white rounded border border-neutral-200 max-w-md">
                  <FileText className="w-12 h-12 text-neutral-400 mx-auto mb-2" />
                  <p className="font-semibold text-sm text-neutral-800">
                    Preview not available for this format.
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    You can download and view this document on your device.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDownloadDocument(previewDoc)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded text-xs font-semibold hover:bg-neutral-850 cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Download {previewDoc.fileName}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-neutral-500">
              <span className="font-mono text-center sm:text-left">
                Size: {formatFileSize(previewDoc.fileSize)} • Uploaded: {formatDateDisplay(previewDoc.createdAt)}
                {previewIsFromCache && " • ⚡ In-Memory Cache (0 network requests)"}
              </span>
              <button
                onClick={handleCloseDocumentPreview}
                className="px-3.5 py-1.5 bg-black text-white rounded text-xs font-semibold hover:bg-neutral-850 cursor-pointer w-full sm:w-auto"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DOCUMENT DELETE CONFIRMATION ───────────────────────────── */}
      {deleteConfirmDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm text-black">Confirm Document Deletion</h3>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <strong className="text-black font-semibold">"{deleteConfirmDoc.fileName}"</strong>{" "}
              associated with <strong className="text-black">{deleteConfirmDoc.workName}</strong>?
              This will remove the file from secure persistent storage.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmDoc(null)}
                disabled={isDeletingDoc}
                className="px-3.5 py-1.5 border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold rounded text-black bg-white cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDocument}
                disabled={isDeletingDoc}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isDeletingDoc ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: INSURANCE DETAILS VIEW ─────────────────────────────────── */}
      {viewInsuranceRecord && (
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
                onClick={() => setViewInsuranceRecord(null)}
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
                <span className="text-sm font-bold text-black">{viewInsuranceRecord.workName}</span>
                {viewInsuranceRecord.workReferenceNo && (
                  <span className="text-xs text-neutral-500 block font-mono">
                    Agreement No: {viewInsuranceRecord.workReferenceNo}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-neutral-100 py-3">
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Insurance Agent
                  </span>
                  <span className="font-semibold text-black">{viewInsuranceRecord.insuranceAgentName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Mobile Number
                  </span>
                  <a
                    href={`tel:${viewInsuranceRecord.mobileNumber}`}
                    className="font-mono font-semibold text-black hover:underline"
                  >
                    {viewInsuranceRecord.mobileNumber}
                  </a>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    LOA Sent Date
                  </span>
                  <span className="font-mono text-neutral-800">
                    {formatDateDisplay(viewInsuranceRecord.loaSentDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Insurance Fee
                  </span>
                  <span className="font-mono font-bold text-black text-sm">
                    ₹{Number(viewInsuranceRecord.insuranceFee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Insurance Received Date
                  </span>
                  {viewInsuranceRecord.insuranceReceivedDate ? (
                    <span className="font-mono text-emerald-700 font-semibold">
                      {formatDateDisplay(viewInsuranceRecord.insuranceReceivedDate)}
                    </span>
                  ) : (
                    <span className="text-amber-700 font-medium italic">Pending Receipt</span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-0.5">
                    Policy Document
                  </span>
                  {viewInsuranceRecord.documentPath ? (
                    <span className="text-emerald-700 font-medium">Uploaded & Secured</span>
                  ) : (
                    <span className="text-neutral-400 italic">Not Uploaded</span>
                  )}
                </div>
              </div>

              {viewInsuranceRecord.documentPath && (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-neutral-700 shrink-0" />
                    <div className="truncate">
                      <p className="font-semibold text-black truncate">
                        {viewInsuranceRecord.documentName || "Insurance Policy Document"}
                      </p>
                      {viewInsuranceRecord.documentSize && (
                        <p className="text-[10px] text-neutral-400 font-mono">
                          {formatFileSize(viewInsuranceRecord.documentSize)} • Protected Storage
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <a
                      href={`/api/insurance/documents/${viewInsuranceRecord.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-white border border-neutral-300 hover:border-black rounded text-[11px] font-semibold text-black transition-colors"
                    >
                      View
                    </a>
                    <a
                      href={`/api/insurance/documents/${viewInsuranceRecord.id}?download=1`}
                      download
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
                  const rec = viewInsuranceRecord;
                  setViewInsuranceRecord(null);
                  handleInsuranceEdit(rec);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 hover:bg-white text-xs font-semibold rounded text-black bg-white cursor-pointer transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Record</span>
              </button>
              <button
                onClick={() => setViewInsuranceRecord(null)}
                className="px-3.5 py-1.5 bg-black text-white hover:bg-neutral-850 text-xs font-semibold rounded cursor-pointer transition-colors"
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
