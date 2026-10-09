import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dbService } from '@/lib/db-service';
import { getTenantContextFromToken, assertPermission } from '@/lib/auth/tenant';

export async function GET() {
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

    assertPermission(tenantCtx, 'INSURANCE_VIEW');

    const records = await dbService.getPublicWorksInsurances(tenantCtx.email);
    return NextResponse.json({ success: true, data: records });
  } catch (error: any) {
    console.error('Error fetching public works insurances:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status });
  }
}

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

    assertPermission(tenantCtx, 'INSURANCE_CREATE');

    const body = await request.json();
    const created = await dbService.createPublicWorksInsurance(body, tenantCtx.email);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating public works insurance:', error);
    const status = error.message?.includes('Unauthorized')
      ? 403
      : error.message?.includes('not found') || error.message?.includes('strictly') || error.message?.includes('required') || error.message?.includes('already exists')
      ? 400
      : 500;
    return NextResponse.json({ error: error.message || 'Failed to create insurance record' }, { status });
  }
}
