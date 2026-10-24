import { NextResponse } from 'next/server';
import { resolveAuthenticatedTenant, assertPermission } from '@/lib/auth/tenant';
import path from 'path';
import {
  saveInsuranceDocument,
  deleteInsuranceDocument,
  generateStorageId,
  validateDocumentContent,
  initChunkedInsuranceDocument,
  appendInsuranceDocumentChunk,
} from '@/lib/document-storage';
import { dbService } from '@/lib/db-service';
import prisma from '@/lib/prisma';

import { PerformanceTracker } from '@/lib/performance-timing';

import { hasPermission } from '@/lib/auth/rbac';

export async function POST(request: Request) {
  const tracker = new PerformanceTracker('apiUpload');
  let currentStorageId: string | null = null;
  let currentUserEmail: string | null = null;

  try {
    tracker.startMarker('auth');
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    currentUserEmail = tenantCtx.email;

    // Must have document create or insurance create permissions
    if (!hasPermission(tenantCtx.role, 'DOCUMENT_CREATE') && !hasPermission(tenantCtx.role, 'INSURANCE_CREATE')) {
      return NextResponse.json(
        { error: `Unauthorized: Role '${tenantCtx.role}' lacks permission to upload documents.` },
        { status: 403 }
      );
    }
    tracker.endMarker('auth');

    tracker.startMarker('parsePayload');
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'File size exceeds upload limit or malformed form data.' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;
    const workId = formData.get('workId') as string | null;
    const category = formData.get('category') as string | null;
    const chunkIndex = parseInt((formData.get('chunkIndex') as string) || '0', 10);
    const totalChunks = parseInt((formData.get('totalChunks') as string) || '1', 10);
    const uploadId = (formData.get('uploadId') as string) || null;
    const rawFileName = (formData.get('fileName') as string) || file?.name || 'document';
    const declaredFileSize = parseInt(
      (formData.get('fileSize') as string) || (file ? `${file.size}` : '0'),
      10
    );
    const declaredMimeType = (formData.get('mimeType') as string) || file?.type || 'application/octet-stream';

    if (!file) {
      return NextResponse.json({ error: 'No document file provided.' }, { status: 400 });
    }

    // Strictly enforce 10 MB maximum file size limit
    if (declaredFileSize > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size exceeds the 10 MB upload limit.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const chunkBuffer = Buffer.from(arrayBuffer);
    tracker.endMarker('parsePayload');

    tracker.startMarker('saveStorageAndMetadata');
    const sanitizedOriginalName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._\- ]/g, '_');

    // Case 1: Initial chunk (or single-chunk upload)
    if (chunkIndex === 0) {
      const storageId = uploadId || generateStorageId();
      currentStorageId = storageId;
      const documentPath = `db://${storageId}`;

      // Initialize chunked storage record in MongoDB Atlas (and validate magic bytes on chunk 0)
      const storedDoc = await initChunkedInsuranceDocument(
        storageId,
        chunkBuffer,
        sanitizedOriginalName,
        declaredMimeType,
        declaredFileSize > 0 ? declaredFileSize : chunkBuffer.length,
        tenantCtx.email,
        tenantCtx.organizationId
      );

      // If this is a single-chunk upload, finalize immediately
      if (totalChunks <= 1) {
        let documentRecord = null;
        if (workId && category) {
          documentRecord = await dbService.createPublicWorksDocument(
            {
              workId,
              category,
              fileName: sanitizedOriginalName,
              fileSize: storedDoc.documentSize,
              mimeType: storedDoc.documentMimeType,
              documentPath,
              uploaderName: tenantCtx.name || tenantCtx.email.split('@')[0],
              organizationId: tenantCtx.organizationId,
            },
            tenantCtx.email
          );
        }

        tracker.endMarker('saveStorageAndMetadata');
        tracker.finish(true, {
          fileSize: storedDoc.documentSize,
          hasRecord: Boolean(documentRecord),
          chunks: 1,
        });

        const response = NextResponse.json({
          success: true,
          uploadId: storageId,
          document: storedDoc,
          record: documentRecord,
        });
        response.headers.set('Server-Timing', tracker.getServerTimingHeader());
        return response;
      }

      // Multi-chunk upload in progress: Return uploadId for subsequent chunks
      tracker.endMarker('saveStorageAndMetadata');
      tracker.finish(true, {
        chunkIndex: 0,
        totalChunks,
      });

      const response = NextResponse.json({
        success: true,
        uploadId: storageId,
        chunkIndex: 0,
        totalChunks,
      });
      response.headers.set('Server-Timing', tracker.getServerTimingHeader());
      return response;
    }

    // Case 2: Subsequent chunks (chunkIndex > 0)
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId is required for chunk upload.' }, { status: 400 });
    }
    currentStorageId = uploadId;
    const documentPath = `db://${uploadId}`;

    // Append chunk to persistent MongoDB Atlas InsuranceDocumentFile record
    const updatedDoc = await appendInsuranceDocumentChunk(uploadId, chunkBuffer, tenantCtx.email);

    // If final chunk reached, create metadata record if workId & category provided
    if (chunkIndex === totalChunks - 1) {
      let documentRecord = null;
      if (workId && category) {
        documentRecord = await dbService.createPublicWorksDocument(
          {
            workId,
            category,
            fileName: updatedDoc.documentName,
            fileSize: updatedDoc.documentSize,
            mimeType: updatedDoc.documentMimeType,
            documentPath,
            uploaderName: tenantCtx.name || tenantCtx.email.split('@')[0],
            organizationId: tenantCtx.organizationId,
          },
          tenantCtx.email
        );
      }

      tracker.endMarker('saveStorageAndMetadata');
      tracker.finish(true, {
        fileSize: updatedDoc.documentSize,
        hasRecord: Boolean(documentRecord),
        chunks: totalChunks,
      });

      const response = NextResponse.json({
        success: true,
        uploadId,
        document: updatedDoc,
        record: documentRecord,
      });
      response.headers.set('Server-Timing', tracker.getServerTimingHeader());
      return response;
    }

    // Intermediate chunk saved successfully
    tracker.endMarker('saveStorageAndMetadata');
    tracker.finish(true, {
      chunkIndex,
      totalChunks,
    });

    const response = NextResponse.json({
      success: true,
      uploadId,
      chunkIndex,
      totalChunks,
    });
    response.headers.set('Server-Timing', tracker.getServerTimingHeader());
    return response;
  } catch (error: any) {
    tracker.finish(false, { error: error.message || 'unknown' });
    console.error('Error uploading document:', error);

    // Rollback orphaned chunks if an upload was aborted mid-stream
    if (currentStorageId && currentUserEmail) {
      await Promise.allSettled([
        deleteInsuranceDocument(`db://${currentStorageId}`, currentUserEmail),
        prisma.publicWorksDocument.deleteMany({
          where: { documentPath: `db://${currentStorageId}`, ownerEmail: currentUserEmail },
        }),
      ]);
    }

    const errMsg = error.message || '';
    const isClientError =
      errMsg.includes('Unsupported') ||
      errMsg.includes('limit') ||
      errMsg.includes('Invalid') ||
      errMsg.includes('required') ||
      errMsg.includes('started') ||
      errMsg.includes('not found') ||
      errMsg.includes('FormData') ||
      errMsg.includes('large') ||
      errMsg.includes('exceed');

    const status = errMsg.includes('Unauthorized') ? 403 : isClientError ? 400 : 500;
    const clientMessage = errMsg.includes('FormData')
      ? 'File size exceeds the 10 MB upload limit.'
      : errMsg || 'File upload failed';
    return NextResponse.json({ error: clientMessage }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (
      !hasPermission(tenantCtx.role, 'DOCUMENT_DELETE') &&
      !hasPermission(tenantCtx.role, 'INSURANCE_DELETE') &&
      !hasPermission(tenantCtx.role, 'DOCUMENT_CREATE') &&
      !hasPermission(tenantCtx.role, 'INSURANCE_CREATE')
    ) {
      return NextResponse.json({ error: `Unauthorized: Role '${tenantCtx.role}' lacks permission to delete documents.` }, { status: 403 });
    }

    const body = await request.json();
    const { documentPath } = body;
    if (!documentPath) {
      return NextResponse.json({ error: 'documentPath is required' }, { status: 400 });
    }

    await deleteInsuranceDocument(documentPath, tenantCtx.email);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to delete document' }, { status });
  }
}
