import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getTenantContextFromToken, assertPermission } from '@/lib/auth/tenant';
import { saveInsuranceDocument, deleteInsuranceDocument } from '@/lib/document-storage';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tenantCtx = await getTenantContextFromToken(token);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    // Must have create or update permissions
    assertPermission(tenantCtx, 'INSURANCE_CREATE');

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No document file provided.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const savedDoc = await saveInsuranceDocument(
      buffer,
      file.name,
      file.type,
      tenantCtx.email
    );

    return NextResponse.json({
      success: true,
      document: savedDoc,
    });
  } catch (error: any) {
    console.error('Error uploading insurance document:', error);
    const status = error.message?.includes('Unauthorized')
      ? 403
      : error.message?.includes('Unsupported') || error.message?.includes('limit') || error.message?.includes('Invalid')
      ? 400
      : 500;
    return NextResponse.json({ error: error.message || 'File upload failed' }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tenantCtx = await getTenantContextFromToken(token);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    assertPermission(tenantCtx, 'INSURANCE_CREATE');

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
