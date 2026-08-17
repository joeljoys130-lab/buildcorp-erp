import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { dbService } from '@/lib/db-service';
import { getTenantContextFromToken, assertPermission } from '@/lib/auth/tenant';

export async function GET(
  request: Request,
  context: { params: Promise<{ workId: string }> }
) {
  try {
    const { workId } = await context.params;

    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const tenantCtx = await getTenantContextFromToken(token);
    if (!tenantCtx) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    // Check RBAC permission for financial profit calculations
    assertPermission(tenantCtx, 'EXPENSE_VIEW');

    const ownerEmail = tenantCtx.email;

    // Fetch entries and private works for this tenant
    const entries = (await dbService.getEntries(ownerEmail)) as any[];
    const privateWorks = await dbService.getPrivateWorks(ownerEmail);

    // Find the work (either government contract entry or private work)
    let workName = '';
    let agreedAmount = 0;
    let gstApplicable = true;

    const entry = entries.find((e: any) => e.id === workId);
    if (entry) {
      workName = entry.workName;
      agreedAmount = entry.amount;
      gstApplicable = entry.gstApplicable;
    } else {
      const privateWork = privateWorks.find((p: any) => p.id === workId);
      if (privateWork) {
        workName = privateWork.workName;
        agreedAmount = privateWork.approxFinalWorkAmount;
        gstApplicable = privateWork.gstApplicable;
      } else {
        return NextResponse.json({ error: 'Work not found or access denied' }, { status: 404 });
      }
    }

    // Fetch materials costs
    const cementLoads = await dbService.getCementLoads(ownerEmail);
    const tarLoads = await dbService.getTarLoads(ownerEmail);

    const cementCost = cementLoads
      .filter((cl: any) => cl.workId === workId)
      .reduce((sum: number, cl: any) => sum + cl.amountPerLoad, 0);

    const tarCost = tarLoads
      .filter((tl: any) => tl.workId === workId)
      .reduce((sum: number, tl: any) => sum + tl.amountPerLoad, 0);

    const materialsCost = cementCost + tarCost;

    // Fetch execution expenses
    const expenses = await dbService.getExpenses(ownerEmail);
    const executionExpense = expenses
      .filter((exp: any) => exp.workId === workId)
      .reduce((sum: number, exp: any) => sum + exp.amount, 0);

    // Calculations
    const gstPercentage = gstApplicable ? 18 : 0;
    const gstAmount = agreedAmount * (gstPercentage / 100);
    const agreedAmountWithGST = agreedAmount + gstAmount;

    const totalExpense = materialsCost + executionExpense;
    const totalExpenseWithGST = totalExpense + (totalExpense * 0.18); // Formula: Total Expense + 18% GST

    const overallProfit = agreedAmountWithGST - totalExpenseWithGST;
    const profitPercentage = agreedAmountWithGST > 0 ? (overallProfit / agreedAmountWithGST) * 100 : 0;

    return NextResponse.json({
      workId,
      workName,
      agreedAmount,
      gstPercentage,
      gstAmount,
      agreedAmountWithGST,
      materialsCost,
      executionExpense,
      totalExpense,
      totalExpenseWithGST,
      overallProfit,
      profitPercentage: Math.round(profitPercentage * 100) / 100
    });
  } catch (error: any) {
    console.error('Error calculating profit:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
