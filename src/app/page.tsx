import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTenantContextFromToken } from '@/lib/auth/tenant';
import { dbService } from '@/lib/db-service';
import DashboardPortal from '@/components/dashboard-portal';

export default async function Page() {
  // ── Auth guard & stateless tenant context resolution ─────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) {
    redirect('/login');
  }

  const ctx = await getTenantContextFromToken(token);
  if (!ctx) {
    redirect('/login');
  }

  const user = {
    id: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    role: ctx.role,
  };

  // ── Parallel read of initial ERP data directly bound to authenticated email ─
  const [
    entries,
    cementLoads,
    tarLoads,
    stockRegister,
    siteMaterials,
    workBasedEntries,
    privateWorks,
  ] = await Promise.all([
    dbService.getEntries(ctx.email),
    dbService.getCementLoads(ctx.email),
    dbService.getTarLoads(ctx.email),
    dbService.getStockRegister(ctx.email),
    dbService.getSiteMaterials(ctx.email),
    dbService.getWorkBasedEntries(ctx.email),
    dbService.getPrivateWorks(ctx.email),
  ]);

  const initialData = {
    entries,
    cementLoads,
    tarLoads,
    stockRegister,
    siteMaterials,
    workBasedEntries,
    privateWorks,
  };

  return <DashboardPortal initialUser={user} initialData={initialData} />;
}
