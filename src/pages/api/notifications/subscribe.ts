import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/auth/jwt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const decoded = verifyAccessToken(token) as { id: string; email: string; organizationId?: string } | null;
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid session' });
  }

  const { subscription } = req.body as {
    subscription?: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
  };

  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ success: false, error: 'Invalid push subscription payload' });
  }

  const userAgent = req.headers['user-agent'] || undefined;

  try {
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    const organizationId = user?.organizationId || decoded.organizationId || null;

    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId: decoded.id,
        ownerEmail: decoded.email,
        organizationId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      },
      update: {
        userId: decoded.id,
        ownerEmail: decoded.email,
        organizationId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
      },
    });

    return res.status(200).json({ success: true, subscriptionId: saved.id });
  } catch (err: any) {
    console.error('Subscription error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save push subscription' });
  }
}
