import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { resolveAuthenticatedTenantFromApiRequest } from '@/lib/auth/tenant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const tenantCtx = await resolveAuthenticatedTenantFromApiRequest(req);
  if (!tenantCtx) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    return res.status(400).json({ success: false, error: 'Missing endpoint' });
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: tenantCtx.userId,
      },
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
  }
}
