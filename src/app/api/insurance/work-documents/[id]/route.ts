import { NextResponse } from 'next/server';
import { dbService } from '@/lib/db-service';
import { resolveAuthenticatedTenant, assertPermission } from '@/lib/auth/tenant';
import { getInsuranceDocument } from '@/lib/document-storage';

import { PerformanceTracker } from '@/lib/performance-timing';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const tracker = new PerformanceTracker('apiGetWorkDocument');
  try {
    const { id } = await context.params;

    tracker.startMarker('auth');
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    assertPermission(tenantCtx, 'INSURANCE_VIEW');
    tracker.endMarker('auth');

    tracker.startMarker('metaLookup');
    const record = await dbService.getPublicWorksDocumentById(id, tenantCtx.email);
    tracker.endMarker('metaLookup');

    if (!record || !record.documentPath) {
      tracker.finish(false, { error: 'not_found' });
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    // Conditional Cache Check via ETag
    const timestamp = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
    const etag = `"${id}-${record.fileSize || 0}-${timestamp}"`;
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

    tracker.startMarker('readStorage');
    const doc = await getInsuranceDocument(record.documentPath, tenantCtx.email);
    tracker.endMarker('readStorage');

    const url = new URL(request.url);
    const isDownload = url.searchParams.get('download') === '1';

    const filename = record.fileName || doc.fileName || 'document.pdf';
    const disposition = isDownload ? 'attachment' : 'inline';
    const mimeType = record.mimeType || doc.mimeType || 'application/pdf';
    const totalSize = doc.buffer.length;

    tracker.finish(true, { sizeBytes: totalSize, isDownload });

    // Support HTTP Range Requests
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
    console.error('Error retrieving document:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to retrieve document' }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const tenantCtx = await resolveAuthenticatedTenant();
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    assertPermission(tenantCtx, 'INSURANCE_DELETE');

    const success = await dbService.deletePublicWorksDocument(id, tenantCtx.email);
    if (!success) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to delete document' }, { status });
  }
}
