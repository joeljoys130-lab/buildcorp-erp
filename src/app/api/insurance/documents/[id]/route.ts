import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getTenantContextFromToken, assertPermission } from '@/lib/auth/tenant';
import { getInsuranceDocument } from '@/lib/document-storage';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tenantCtx = await getTenantContextFromToken(token);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    assertPermission(tenantCtx, 'INSURANCE_VIEW');

    // Multi-tenant check: document must belong to tenant's insurance record
    const record = await prisma.publicWorksInsurance.findFirst({
      where: {
        id,
        ownerEmail: tenantCtx.email,
        OR: [
          { deletedAt: { isSet: false } },
          { deletedAt: null }
        ]
      }
    });

    if (!record || !record.documentPath) {
      return NextResponse.json({ error: 'Document not found or access denied' }, { status: 404 });
    }

    const doc = await getInsuranceDocument(record.documentPath, tenantCtx.email);

    const url = new URL(request.url);
    const isDownload = url.searchParams.get('download') === '1';

    const filename = record.documentName || doc.fileName || 'insurance-document.pdf';
    const disposition = isDownload ? 'attachment' : 'inline';
    const mimeType = record.documentMimeType || doc.mimeType || 'application/pdf';

    return new Response(doc.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': doc.buffer.length.toString(),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Error retrieving insurance document:', error);
    const status = error.message?.includes('Unauthorized')
      ? 403
      : error.message?.includes('not found')
      ? 404
      : 500;
    return NextResponse.json({ error: error.message || 'Failed to retrieve document' }, { status });
  }
}
