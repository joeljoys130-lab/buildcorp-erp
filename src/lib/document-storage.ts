/**
 * document-storage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistent, tenant-isolated document storage for BuildCorp ERP.
 * Compatible with Netlify Serverless, Netlify Functions, and Cloud deployments.
 *
 * Architecture:
 * - Documents are stored persistently in dedicated chunked storage records
 *   in MongoDB Atlas (`InsuranceDocumentFile`), completely decoupled from
 *   ephemeral container disks or /tmp.
 * - Files are never exposed via public static URLs.
 * - Access is strictly authenticated and tenant-isolated.
 * - Orphaned files are automatically purged when documents are replaced or updated.
 */

import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import prisma from './prisma';
import { PerformanceTracker } from './performance-timing';

// Maximum allowed document size (10 MB)
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

// 2 MB chunk size for optimized binary transfer and reduced BSON array / string allocation overhead
const CHUNK_SIZE = 2 * 1024 * 1024;

/**
 * Generates a collision-resistant 25-character storage ID compatible with cuid format.
 */
export function generateStorageId(): string {
  return 'c' + Date.now().toString(36) + randomBytes(8).toString('hex').slice(0, 16);
}

// Allowed MIME types and extensions
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

/**
 * Validates document content by inspecting magic byte signatures
 * to prevent extension/MIME spoofing.
 */
export function validateDocumentContent(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string
): { isValid: boolean; error?: string; detectedMimeType?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: 'Document file is empty.' };
  }

  if (buffer.length > MAX_DOCUMENT_SIZE) {
    return {
      isValid: false,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit.`,
    };
  }

  const ext = path.extname(filename || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      isValid: false,
      error: `Unsupported file extension (${ext || 'none'}). Only PDF, JPG, PNG, and WebP are allowed.`,
    };
  }

  const normalizedDeclared = (declaredMimeType || '').toLowerCase().trim();

  // Inspect file signature magic bytes
  let detectedMimeType = '';

  // PDF: starts with %PDF- (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    detectedMimeType = 'application/pdf';
  }
  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  else if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    detectedMimeType = 'image/png';
  }
  // JPEG: 0xFF 0xD8 0xFF
  else if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    detectedMimeType = 'image/jpeg';
  }
  // WebP: starts with "RIFF" and contains "WEBP" at offset 8
  else if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    detectedMimeType = 'image/webp';
  }

  if (!detectedMimeType) {
    return {
      isValid: false,
      error: 'File content does not match allowed document formats (PDF, JPG, PNG, WebP).',
    };
  }

  if (!ALLOWED_MIME_TYPES.has(normalizedDeclared) && !ALLOWED_MIME_TYPES.has(detectedMimeType)) {
    return {
      isValid: false,
      error: `Unsupported MIME type: ${declaredMimeType}`,
    };
  }

  return { isValid: true, detectedMimeType };
}

/**
 * Splits a Buffer into Base64 chunks for safe MongoDB BSON persistence.
 */
function bufferToChunks(buffer: Buffer): string[] {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const end = Math.min(offset + CHUNK_SIZE, buffer.length);
    const slice = buffer.subarray(offset, end);
    chunks.push(slice.toString('base64'));
    offset = end;
  }
  return chunks;
}

/**
 * Reassembles an array of Base64 chunks back into a contiguous Buffer.
 * Uses zero-intermediate-copy direct buffer decoding when expectedSize is provided.
 */
function chunksToBuffer(chunks: string[], expectedSize?: number): Buffer {
  if (!chunks || chunks.length === 0) return Buffer.alloc(0);

  if (expectedSize && expectedSize > 0) {
    const target = Buffer.allocUnsafe(expectedSize);
    let writeOffset = 0;
    for (let i = 0; i < chunks.length; i++) {
      writeOffset += target.write(chunks[i], writeOffset, 'base64');
    }
    return target;
  }

  // Fallback for variable or unknown sizes
  const buffers = chunks.map((c) => Buffer.from(c, 'base64'));
  return Buffer.concat(buffers);
}

/**
 * Safely saves an uploaded insurance document into persistent tenant-isolated storage.
 * Completely persists on Netlify by saving into dedicated database storage records.
 */
export async function saveInsuranceDocument(
  buffer: Buffer,
  originalFilename: string,
  declaredMimeType: string,
  ownerEmail: string,
  organizationId?: string | null,
  customId?: string
): Promise<{
  documentName: string;
  documentPath: string;
  documentMimeType: string;
  documentSize: number;
}> {
  const tracker = new PerformanceTracker('saveDocument');

  tracker.startMarker('validation');
  const validation = validateDocumentContent(buffer, originalFilename, declaredMimeType);
  tracker.endMarker('validation');

  if (!validation.isValid) {
    tracker.finish(false, { error: 'validation_failed' });
    throw new Error(validation.error || 'Invalid document file');
  }

  const mimeType = validation.detectedMimeType || declaredMimeType;
  const sanitizedOriginalName = path.basename(originalFilename).replace(/[^a-zA-Z0-9._\- ]/g, '_');

  // Convert buffer into persistent storage chunks
  tracker.startMarker('chunking');
  const chunks = bufferToChunks(buffer);
  tracker.endMarker('chunking');

  const fileId = customId || generateStorageId();

  // Store in persistent MongoDB Atlas collection.
  // Using select: { id: true } avoids transmitting the entire multi-MB chunks array
  // back from MongoDB Atlas in the create response!
  tracker.startMarker('dbWrite');
  const storedFile = await prisma.insuranceDocumentFile.create({
    data: {
      id: fileId,
      ownerEmail,
      organizationId: organizationId || null,
      fileName: sanitizedOriginalName,
      mimeType,
      fileSize: buffer.length,
      chunks,
    },
    select: {
      id: true,
    },
  });
  tracker.endMarker('dbWrite');

  const documentPath = `db://${storedFile.id}`;

  tracker.finish(true, {
    sizeBytes: buffer.length,
    chunks: chunks.length,
  });

  return {
    documentName: sanitizedOriginalName,
    documentPath,
    documentMimeType: mimeType,
    documentSize: buffer.length,
  };
}

/**
 * Retrieves document metadata without loading heavy binary chunks over the database network.
 */
export async function getInsuranceDocumentMetadata(
  documentPath: string,
  ownerEmail?: string
): Promise<{
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  ownerEmail: string;
  createdAt: Date;
} | null> {
  if (!documentPath || !documentPath.startsWith('db://')) return null;

  const fileId = documentPath.replace('db://', '');
  const record = await prisma.insuranceDocumentFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      ownerEmail: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  if (!record || record.deletedAt) return null;
  if (ownerEmail && record.ownerEmail !== ownerEmail) return null;

  return record;
}

/**
 * Retrieves a document from persistent storage, enforcing tenant ownership.
 */
export async function getInsuranceDocument(
  documentPath: string,
  ownerEmail?: string
): Promise<{
  buffer: Buffer;
  fileName?: string;
  mimeType?: string;
  fileSize: number;
}> {
  if (!documentPath) {
    throw new Error('Invalid document path');
  }

  const tracker = new PerformanceTracker('getDocument');

  // 1. Persistent Database Storage Path (db://<id>)
  if (documentPath.startsWith('db://')) {
    const fileId = documentPath.replace('db://', '');

    // Clustered primary index lookup on _id is O(1)
    tracker.startMarker('dbRead');
    const fileRecord = await prisma.insuranceDocumentFile.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        ownerEmail: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        chunks: true,
        deletedAt: true,
      },
    });
    tracker.endMarker('dbRead');

    if (!fileRecord || fileRecord.deletedAt || !fileRecord.chunks || fileRecord.chunks.length === 0) {
      tracker.finish(false, { error: 'not_found' });
      throw new Error('Document file not found on persistent storage');
    }

    // Strict tenant isolation
    if (ownerEmail && fileRecord.ownerEmail !== ownerEmail) {
      tracker.finish(false, { error: 'unauthorized_tenant' });
      throw new Error('Document file not found on persistent storage');
    }

    tracker.startMarker('decodeChunks');
    const buffer = chunksToBuffer(fileRecord.chunks, fileRecord.fileSize);
    tracker.endMarker('decodeChunks');

    tracker.finish(true, {
      sizeBytes: buffer.length,
      chunks: fileRecord.chunks.length,
    });

    return {
      buffer,
      fileName: fileRecord.fileName,
      mimeType: fileRecord.mimeType,
      fileSize: fileRecord.fileSize,
    };
  }

  // 2. Backward compatibility for local storage path (if any legacy file exists)
  if (documentPath.includes('..')) {
    throw new Error('Access denied: Path traversal detected');
  }

  const baseDir = path.join(process.cwd(), 'storage', 'insurance-documents');
  const fullPath = path.resolve(baseDir, documentPath);

  if (fullPath.startsWith(path.resolve(baseDir)) && fs.existsSync(fullPath)) {
    const buffer = await fs.promises.readFile(fullPath);
    return {
      buffer,
      fileName: path.basename(documentPath),
      fileSize: buffer.length,
    };
  }

  throw new Error('Document file not found on storage');
}

/**
 * Deletes a document from persistent storage.
 * Ensures document updates or deletions do not orphan stored files.
 */
export async function deleteInsuranceDocument(
  documentPath?: string | null,
  ownerEmail?: string
): Promise<void> {
  if (!documentPath) return;

  try {
    // 1. Persistent Database Storage
    if (documentPath.startsWith('db://')) {
      const fileId = documentPath.replace('db://', '');
      const whereClause: Record<string, unknown> = { id: fileId };
      if (ownerEmail) {
        whereClause.ownerEmail = ownerEmail;
      }
      await prisma.insuranceDocumentFile.deleteMany({
        where: whereClause,
      });
      return;
    }

    // 2. Legacy local storage file cleanup
    if (!documentPath.includes('..')) {
      const baseDir = path.join(process.cwd(), 'storage', 'insurance-documents');
      const fullPath = path.resolve(baseDir, documentPath);
      if (fullPath.startsWith(path.resolve(baseDir)) && fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    }
  } catch (err) {
    console.warn('Failed to delete document file:', err);
  }
}

// ── Public Works Documents Storage Aliases ──────────────────────────────────
export const savePublicWorksDocument = saveInsuranceDocument;
export const getPublicWorksDocument = getInsuranceDocument;
export const getPublicWorksDocumentMetadata = getInsuranceDocumentMetadata;
export const deletePublicWorksDocument = deleteInsuranceDocument;

/**
 * Initializes a chunked document storage record with the first binary chunk.
 * Validates document magic bytes and extension on the initial chunk.
 */
export async function initChunkedInsuranceDocument(
  storageId: string,
  chunkBuffer: Buffer,
  originalFilename: string,
  declaredMimeType: string,
  declaredFileSize: number,
  ownerEmail: string,
  organizationId?: string | null
): Promise<{
  documentName: string;
  documentPath: string;
  documentMimeType: string;
  documentSize: number;
}> {
  if (declaredFileSize > MAX_DOCUMENT_SIZE) {
    throw new Error(`File size (${(declaredFileSize / (1024 * 1024)).toFixed(1)} MB) exceeds the 10 MB limit.`);
  }

  const validation = validateDocumentContent(chunkBuffer, originalFilename, declaredMimeType);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid document file');
  }

  const mimeType = validation.detectedMimeType || declaredMimeType;
  const sanitizedOriginalName = path.basename(originalFilename).replace(/[^a-zA-Z0-9._\- ]/g, '_');
  const chunkBase64 = chunkBuffer.toString('base64');

  await prisma.insuranceDocumentFile.create({
    data: {
      id: storageId,
      ownerEmail,
      organizationId: organizationId || null,
      fileName: sanitizedOriginalName,
      mimeType,
      fileSize: declaredFileSize,
      chunks: [chunkBase64],
    },
    select: {
      id: true,
    },
  });

  return {
    documentName: sanitizedOriginalName,
    documentPath: `db://${storageId}`,
    documentMimeType: mimeType,
    documentSize: declaredFileSize,
  };
}

/**
 * Appends a binary chunk to an existing chunked document storage record.
 * Validates tenant ownership.
 */
export async function appendInsuranceDocumentChunk(
  storageId: string,
  chunkBuffer: Buffer,
  ownerEmail: string
): Promise<{
  documentName: string;
  documentPath: string;
  documentMimeType: string;
  documentSize: number;
}> {
  const existing = await prisma.insuranceDocumentFile.findUnique({
    where: { id: storageId },
    select: { id: true, ownerEmail: true, fileName: true, mimeType: true, fileSize: true },
  });

  if (!existing || existing.ownerEmail !== ownerEmail) {
    throw new Error('Document file not found on persistent storage');
  }

  const chunkBase64 = chunkBuffer.toString('base64');
  await prisma.insuranceDocumentFile.update({
    where: { id: storageId },
    data: {
      chunks: {
        push: chunkBase64,
      },
    },
    select: { id: true },
  });

  return {
    documentName: existing.fileName,
    documentPath: `db://${storageId}`,
    documentMimeType: existing.mimeType,
    documentSize: existing.fileSize,
  };
}

export const initChunkedPublicWorksDocument = initChunkedInsuranceDocument;
export const appendPublicWorksDocumentChunk = appendInsuranceDocumentChunk;

