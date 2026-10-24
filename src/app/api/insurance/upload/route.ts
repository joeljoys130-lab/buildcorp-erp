import { NextResponse } from 'next/server';
import { resolveAuthenticatedTenant, assertPermission } from '@/lib/auth/tenant';
import path from 'path';
import { saveInsuranceDocument, deleteInsuranceDocument, generateStorageId } from '@/lib/document-storage';
import { dbService } from '@/lib/db-service';
import prisma from '@/lib/prisma';

import { PerformanceTracker } from '@/lib/performance-timing';

import { hasPermission } from '@/lib/auth/rbac';

export async function POST(request: Request) {
  const tracker = new PerformanceTracker('apiUpload');
  try {
    tracker.startMarker('auth');
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Must have document create or insurance create permissions
    if (!hasPermission(tenantCtx.role, 'DOCUMENT_CREATE') && !hasPermission(tenantCtx.role, 'INSURANCE_CREATE')) {
      return NextResponse.json(
        { error: `Unauthorized: Role '${tenantCtx.role}' lacks permission to upload documents.` },
        { status: 403 }
      );
    }
    tracker.endMarker('auth');

    // Early reject oversized payloads exceeding 10 MB before parsing body into memory
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 10 * 1024 * 1024 + 65536) {
      return NextResponse.json({ error: 'File size exceeds the 10 MB upload limit.' }, { status: 400 });
    }

    tracker.startMarker('parsePayload');
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'File size exceeds the 10 MB upload limit.' }, { status: 400 });
    }
    const file = formData.get('file') as File | null;
    const workId = formData.get('workId') as string | null;
    const category = formData.get('category') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No document file provided.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    tracker.endMarker('parsePayload');

    tracker.startMarker('saveStorageAndMetadata');
    const storageId = generateStorageId();
    const documentPath = `db://${storageId}`;
    const sanitizedOriginalName = path.basename(file.name).replace(/[^a-zA-Z0-9._\- ]/g, '_');

    let savedDoc;
    let documentRecord = null;

    let storageMs = 0;
    let metaMs = 0;

    try {
      if (workId && category) {
        const t0 = performance.now();
        const pStorage = saveInsuranceDocument(
          buffer,
          file.name,
          file.type,
          tenantCtx.email,
          tenantCtx.organizationId,
          storageId
        ).then((r) => {
          storageMs = performance.now() - t0;
          return r;
        });

        const pMeta = dbService.createPublicWorksDocument(
          {
            workId,
            category,
            fileName: sanitizedOriginalName,
            fileSize: buffer.length,
            mimeType: file.type || 'application/octet-stream',
            documentPath,
            uploaderName: tenantCtx.name || tenantCtx.email.split('@')[0],
            organizationId: tenantCtx.organizationId,
          },
          tenantCtx.email
        ).then((r) => {
          metaMs = performance.now() - t0;
          return r;
        });

        const [storageRes, metaRes] = await Promise.all([pStorage, pMeta]);
        savedDoc = storageRes;
        documentRecord = metaRes;
        tracker.record('storageWrite', storageMs);
        tracker.record('metadataWrite', metaMs);
      } else {
        savedDoc = await saveInsuranceDocument(
          buffer,
          file.name,
          file.type,
          tenantCtx.email,
          tenantCtx.organizationId,
          storageId
        );
      }
    } catch (err: any) {
      // Rollback on any failure to guarantee zero orphaned records or storage chunks
      await Promise.allSettled([
        deleteInsuranceDocument(documentPath, tenantCtx.email),
        prisma.publicWorksDocument.deleteMany({
          where: { documentPath, ownerEmail: tenantCtx.email },
        }),
      ]);
      throw err;
    }
    tracker.endMarker('saveStorageAndMetadata');

    tracker.finish(true, {
      fileSize: buffer.length,
      hasRecord: Boolean(documentRecord),
    });

    const response = NextResponse.json({
      success: true,
      document: savedDoc,
      record: documentRecord,
    });
    response.headers.set('Server-Timing', tracker.getServerTimingHeader());
    return response;
  } catch (error: any) {
    tracker.finish(false, { error: error.message || 'unknown' });
    console.error('Error uploading document:', error);
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
