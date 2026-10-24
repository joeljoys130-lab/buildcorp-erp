import { NextResponse } from 'next/server';
import path from 'path';
import { dbService } from '@/lib/db-service';
import { resolveAuthenticatedTenant } from '@/lib/auth/tenant';
import { hasPermission } from '@/lib/auth/rbac';
import { saveInsuranceDocument, deleteInsuranceDocument, generateStorageId } from '@/lib/document-storage';
import prisma from '@/lib/prisma';
import { PerformanceTracker } from '@/lib/performance-timing';

export async function GET(request: Request) {
  const tracker = new PerformanceTracker('getWorkDocuments');
  try {
    tracker.startMarker('auth');
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(tenantCtx.role, 'DOCUMENT_VIEW') && !hasPermission(tenantCtx.role, 'INSURANCE_VIEW')) {
      return NextResponse.json(
        { error: `Unauthorized: Role '${tenantCtx.role}' lacks view permission.` },
        { status: 403 }
      );
    }
    tracker.endMarker('auth');

    const url = new URL(request.url);
    const workId = url.searchParams.get('workId') || undefined;
    const category = url.searchParams.get('category') || undefined;

    tracker.startMarker('dbQuery');
    const records = await dbService.getPublicWorksDocuments(tenantCtx.email, {
      workId,
      category,
    });
    tracker.endMarker('dbQuery');

    tracker.finish(true, { count: records.length });
    const response = NextResponse.json({ success: true, data: records });
    response.headers.set('Server-Timing', tracker.getServerTimingHeader());
    return response;
  } catch (error: any) {
    tracker.finish(false, { error: error.message || 'unknown' });
    console.error('Error fetching public works documents:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status });
  }
}

export async function POST(request: Request) {
  const tracker = new PerformanceTracker('postWorkDocuments');
  try {
    tracker.startMarker('auth');
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!hasPermission(tenantCtx.role, 'DOCUMENT_CREATE') && !hasPermission(tenantCtx.role, 'INSURANCE_CREATE')) {
      return NextResponse.json(
        { error: `Unauthorized: Role '${tenantCtx.role}' lacks create permission.` },
        { status: 403 }
      );
    }
    tracker.endMarker('auth');

    const contentType = request.headers.get('content-type') || '';

    // Early reject oversized payloads exceeding 10 MB before parsing body into memory
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 10 * 1024 * 1024 + 65536) {
      return NextResponse.json({ error: 'File size exceeds the 10 MB upload limit.' }, { status: 400 });
    }

    // Case 1: Direct multipart/form-data upload (unified binary upload + metadata record creation)
    if (contentType.includes('multipart/form-data')) {
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
      if (!workId) {
        return NextResponse.json({ error: 'Work ID is required.' }, { status: 400 });
      }
      if (!category) {
        return NextResponse.json({ error: 'Document category is required.' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      tracker.endMarker('parsePayload');

      tracker.startMarker('saveStorageAndMetadata');
      const storageId = generateStorageId();
      const documentPath = `db://${storageId}`;
      const sanitizedOriginalName = path.basename(file.name).replace(/[^a-zA-Z0-9._\- ]/g, '_');

      let savedDoc;
      let created;

      try {
        const [storageRes, metaRes] = await Promise.all([
          saveInsuranceDocument(
            buffer,
            file.name,
            file.type,
            tenantCtx.email,
            tenantCtx.organizationId,
            storageId
          ),
          dbService.createPublicWorksDocument(
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
          ),
        ]);
        savedDoc = storageRes;
        created = metaRes;
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
        hasRecord: true,
      });

      const response = NextResponse.json(
        {
          success: true,
          data: created,
          document: savedDoc,
        },
        { status: 201 }
      );
      response.headers.set('Server-Timing', tracker.getServerTimingHeader());
      return response;
    }

    // Case 2: JSON payload (metadata record creation referencing existing storage path)
    tracker.startMarker('parseJson');
    const body = await request.json();
    tracker.endMarker('parseJson');

    tracker.startMarker('createMetadataRecord');
    const created = await dbService.createPublicWorksDocument(
      {
        ...body,
        uploaderName: tenantCtx.name || tenantCtx.email.split('@')[0],
        organizationId: tenantCtx.organizationId,
      },
      tenantCtx.email
    );
    tracker.endMarker('createMetadataRecord');

    tracker.finish(true, { hasRecord: true });

    const response = NextResponse.json({ success: true, data: created }, { status: 201 });
    response.headers.set('Server-Timing', tracker.getServerTimingHeader());
    return response;
  } catch (error: any) {
    tracker.finish(false, { error: error.message || 'unknown' });
    console.error('Error creating public works document record:', error);
    const errMsg = error.message || '';
    const isClientError =
      errMsg.includes('Unsupported') ||
      errMsg.includes('limit') ||
      errMsg.includes('Invalid') ||
      errMsg.includes('required') ||
      errMsg.includes('cannot be uploaded') ||
      errMsg.includes('started') ||
      errMsg.includes('not found') ||
      errMsg.includes('FormData') ||
      errMsg.includes('large') ||
      errMsg.includes('exceed');

    const status = errMsg.includes('Unauthorized') ? 403 : isClientError ? 400 : 500;
    const clientMessage = errMsg.includes('FormData')
      ? 'File size exceeds the 10 MB upload limit.'
      : errMsg || 'Failed to create document record';
    return NextResponse.json({ error: clientMessage }, { status });
  }
}
