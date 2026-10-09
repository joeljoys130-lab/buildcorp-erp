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

    const works = await dbService.getEligiblePublicWorks(tenantCtx.email);
    return NextResponse.json({ success: true, data: works });
  } catch (error: any) {
    console.error('Error fetching eligible public works:', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status });
  }
}
