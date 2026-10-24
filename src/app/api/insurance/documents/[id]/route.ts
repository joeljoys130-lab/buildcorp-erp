import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveAuthenticatedTenant, assertPermission } from '@/lib/auth/tenant';
import { getInsuranceDocument } from '@/lib/document-storage';

import { PerformanceTracker } from '@/lib/performance-timing';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const tracker = new PerformanceTracker('apiGetDocument');
  try {
    const { id } = await context.params;

    tracker.startMarker('auth');
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    assertPermission(tenantCtx, 'INSURANCE_VIEW');
    tracker.endMarker('auth');

    // 1. Direct primary key index lookup on MongoDB Atlas
    tracker.startMarker('metaLookup');
    let documentPath: string | null = null;
    let filename: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | undefined = undefined;
    let updatedAt: Date | null = null;

    if (id.startsWith('ins-doc-')) {
      const insId = id.replace('ins-doc-', '');
      const record = await prisma.publicWorksInsurance.findUnique({
        where: { id: insId },
        select: {
          id: true,
          ownerEmail: true,
          documentPath: true,
          documentName: true,
          documentMimeType: true,
          documentSize: true,
          updatedAt: true,
          deletedAt: true,
        },
      });
      if (record && record.ownerEmail === tenantCtx.email && !record.deletedAt && record.documentPath) {
        documentPath = record.documentPath;
        filename = record.documentName || 'Insurance-Policy.pdf';
        mimeType = record.documentMimeType || 'application/pdf';
        fileSize = record.documentSize || undefined;
        updatedAt = record.updatedAt;
      }
    } else {
      // Direct PublicWorksDocument lookup via _id index
      const pwDoc = await prisma.publicWorksDocument.findUnique({
        where: { id },
        select: {
          id: true,
          ownerEmail: true,
          documentPath: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          updatedAt: true,
          deletedAt: true,
        },
      });

      if (pwDoc && pwDoc.ownerEmail === tenantCtx.email && !pwDoc.deletedAt) {
        documentPath = pwDoc.documentPath;
        filename = pwDoc.fileName;
        mimeType = pwDoc.mimeType;
        fileSize = pwDoc.fileSize;
        updatedAt = pwDoc.updatedAt;
      } else {
        // Fall back to PublicWorksInsurance lookup via _id index
        const record = await prisma.publicWorksInsurance.findUnique({
          where: { id },
          select: {
            id: true,
            ownerEmail: true,
            documentPath: true,
            documentName: true,
            documentMimeType: true,
            documentSize: true,
            updatedAt: true,
            deletedAt: true,
          },
        });
        if (record && record.ownerEmail === tenantCtx.email && !record.deletedAt && record.documentPath) {
          documentPath = record.documentPath;
          filename = record.documentName || 'Insurance-Policy.pdf';
          mimeType = record.documentMimeType || 'application/pdf';
          fileSize = record.documentSize || undefined;
          updatedAt = record.updatedAt;
        } else if (id.startsWith('c') || id.startsWith('db://')) {
          // Direct storage ID lookup for internal persistence testing
          const directFile = await getInsuranceDocument(id.startsWith('db://') ? id : `db://${id}`, tenantCtx.email).catch(() => null);
          if (directFile) {
            documentPath = id.startsWith('db://') ? id : `db://${id}`;
            filename = directFile.fileName || 'document.pdf';
            mimeType = directFile.mimeType || 'application/pdf';
            fileSize = directFile.fileSize;
            updatedAt = new Date();
          }
        }
      }
    }
    tracker.endMarker('metaLookup');

    if (!documentPath) {
      tracker.finish(false, { error: 'not_found' });
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    // 3. Conditional Cache Check via ETag
    const timestamp = updatedAt ? new Date(updatedAt).getTime() : 0;
    const etag = `"${id}-${fileSize || 0}-${timestamp}"`;
    const ifNoneMatch = request.headers.get('if-none-match');

    if (ifNoneMatch && ifNoneMatch === etag) {
      tracker.finish(true, { status: 304, cached: true });
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
          'Server-Timing': tracker.getServerTimingHeader(),
        },
      });
    }

    // 4. Retrieve binary payload
    tracker.startMarker('readStorage');
    const doc = await getInsuranceDocument(documentPath, tenantCtx.email);
    tracker.endMarker('readStorage');

    const url = new URL(request.url);
    const isDownload = url.searchParams.get('download') === '1';

    filename = filename || doc.fileName || 'document.pdf';
    const disposition = isDownload ? 'attachment' : 'inline';
    mimeType = mimeType || doc.mimeType || 'application/pdf';
    const totalSize = doc.buffer.length;

    tracker.finish(true, { sizeBytes: totalSize, isDownload });

    // 5. Support HTTP Range Requests for instant PDF streaming and scrubbing
    const rangeHeader = request.headers.get('range');
    if (rangeHeader && !isDownload) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

        if (!isNaN(start) && start >= 0 && start <= end && end < totalSize) {
          const slice = doc.buffer.subarray(start, end + 1);
          return new Response(slice as unknown as BodyInit, {
            status: 206,
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Content-Length': slice.length.toString(),
              'Accept-Ranges': 'bytes',
              'ETag': etag,
              'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
              'X-Content-Type-Options': 'nosniff',
              'Server-Timing': tracker.getServerTimingHeader(),
            },
          });
        }
      }
    }

    return new Response(doc.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': totalSize.toString(),
        'Accept-Ranges': 'bytes',
        'ETag': etag,
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
        'X-Content-Type-Options': 'nosniff',
        'Server-Timing': tracker.getServerTimingHeader(),
      },
    });
  } catch (error: any) {
    tracker.finish(false, { error: error.message || 'unknown' });
    console.error('Error retrieving insurance document:', error);
    const status = error.message?.includes('Unauthorized')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json({ error: error.message || 'Failed to retrieve document' }, { status });
  }
}
