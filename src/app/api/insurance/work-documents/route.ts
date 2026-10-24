import { NextResponse } from 'next/server';
import path from 'path';
import { dbService } from '@/lib/db-service';
import { resolveAuthenticatedTenant } from '@/lib/auth/tenant';
import { hasPermission } from '@/lib/auth/rbac';
import prisma from '@/lib/prisma';
import {
  saveInsuranceDocument,
  deleteInsuranceDocument,
  generateStorageId,
  initChunkedInsuranceDocument,
  appendInsuranceDocumentChunk,
} from '@/lib/document-storage';
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
      if (!workId) {
        return NextResponse.json({ error: 'Work ID is required.' }, { status: 400 });
      }
      if (!category) {
        return NextResponse.json({ error: 'Document category is required.' }, { status: 400 });
      }

      if (declaredFileSize > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size exceeds the 10 MB upload limit.' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      const chunkBuffer = Buffer.from(arrayBuffer);
      tracker.endMarker('parsePayload');

      tracker.startMarker('saveStorageAndMetadata');
      const sanitizedOriginalName = path.basename(rawFileName).replace(/[^a-zA-Z0-9._\- ]/g, '_');

      if (chunkIndex === 0) {
        const storageId = uploadId || generateStorageId();
        const documentPath = `db://${storageId}`;

        const storedDoc = await initChunkedInsuranceDocument(
          storageId,
          chunkBuffer,
          sanitizedOriginalName,
          declaredMimeType,
          declaredFileSize > 0 ? declaredFileSize : chunkBuffer.length,
          tenantCtx.email,
          tenantCtx.organizationId
        );

        if (totalChunks <= 1) {
          let created;
          try {
            created = await dbService.createPublicWorksDocument(
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
          } catch (err: any) {
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
            fileSize: storedDoc.documentSize,
            hasRecord: true,
            chunks: 1,
          });

          const response = NextResponse.json(
            {
              success: true,
              data: created,
              document: storedDoc,
            },
            { status: 201 }
          );
          response.headers.set('Server-Timing', tracker.getServerTimingHeader());
          return response;
        }

        // Multi-chunk in progress
        tracker.endMarker('saveStorageAndMetadata');
        tracker.finish(true, {
          chunkIndex: 0,
          totalChunks,
        });

        const response = NextResponse.json(
          {
            success: true,
            uploadId: storageId,
            chunkIndex: 0,
            totalChunks,
          },
          { status: 201 }
        );
        response.headers.set('Server-Timing', tracker.getServerTimingHeader());
        return response;
      }

      // Subsequent chunks
      if (!uploadId) {
        return NextResponse.json({ error: 'uploadId is required for chunk upload.' }, { status: 400 });
      }
      const documentPath = `db://${uploadId}`;
      const updatedDoc = await appendInsuranceDocumentChunk(uploadId, chunkBuffer, tenantCtx.email);

      if (chunkIndex === totalChunks - 1) {
        let created;
        try {
          created = await dbService.createPublicWorksDocument(
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
        } catch (err: any) {
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
          fileSize: updatedDoc.documentSize,
          hasRecord: true,
          chunks: totalChunks,
        });

        const response = NextResponse.json(
          {
            success: true,
            data: created,
            document: updatedDoc,
          },
          { status: 201 }
        );
        response.headers.set('Server-Timing', tracker.getServerTimingHeader());
        return response;
      }

      tracker.endMarker('saveStorageAndMetadata');
      tracker.finish(true, {
        chunkIndex,
        totalChunks,
      });

      const response = NextResponse.json(
        {
          success: true,
          uploadId,
          chunkIndex,
          totalChunks,
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
