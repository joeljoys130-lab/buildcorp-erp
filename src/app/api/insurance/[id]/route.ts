import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dbService } from '@/lib/db-service';
import { getTenantContextFromToken, assertPermission } from '@/lib/auth/tenant';

export async function GET(
  _request: Request,
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

    const record = await dbService.getPublicWorksInsuranceById(id, tenantCtx.email);
    if (!record) {
      return NextResponse.json({ error: 'Insurance record not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error: any) {
    console.error('Error fetching insurance record:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status });
  }
}

export async function PUT(
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

    assertPermission(tenantCtx, 'INSURANCE_UPDATE');

    const body = await request.json();
    const updated = await dbService.updatePublicWorksInsurance(id, body, tenantCtx.email);
    if (!updated) {
      return NextResponse.json({ error: 'Insurance record not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating insurance record:', error);
    const status = error.message?.includes('Unauthorized')
      ? 403
      : error.message?.includes('not found') || error.message?.includes('strictly') || error.message?.includes('required') || error.message?.includes('already exists')
      ? 400
      : 500;
    return NextResponse.json({ error: error.message || 'Failed to update insurance record' }, { status });
  }
}

export async function DELETE(
  _request: Request,
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

    assertPermission(tenantCtx, 'INSURANCE_DELETE');

    const success = await dbService.deletePublicWorksInsurance(id, tenantCtx.email);
    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('Error deleting insurance record:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to delete insurance record' }, { status });
  }
}
