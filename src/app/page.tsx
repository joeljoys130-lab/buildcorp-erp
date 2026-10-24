import { redirect } from 'next/navigation';
import { resolveAuthenticatedTenant } from '@/lib/auth/tenant';
import { dbService } from '@/lib/db-service';
import DashboardPortal from '@/components/dashboard-portal';

export default async function Page() {
  // ── Auth guard & stateless tenant context resolution (Clerk + Legacy) ───
  const ctx = await resolveAuthenticatedTenant();
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
    expenses,
    insuranceRecords,
    publicWorksDocuments,
  ] = await Promise.all([
    dbService.getEntries(ctx.email),
    dbService.getCementLoads(ctx.email),
    dbService.getTarLoads(ctx.email),
    dbService.getStockRegister(ctx.email),
    dbService.getSiteMaterials(ctx.email),
    dbService.getWorkBasedEntries(ctx.email),
    dbService.getPrivateWorks(ctx.email),
    dbService.getExpenses(ctx.email),
    dbService.getPublicWorksInsurances(ctx.email),
    dbService.getPublicWorksDocuments(ctx.email),
  ]);

  const initialData = {
    entries,
    cementLoads,
    tarLoads,
    stockRegister,
    siteMaterials,
    workBasedEntries,
    privateWorks,
    expenses,
    insuranceRecords,
    publicWorksDocuments,
  };

  return <DashboardPortal initialUser={user} initialData={initialData} />;
}
