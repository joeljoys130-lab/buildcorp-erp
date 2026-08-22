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

  const decoded = verifyAccessToken(token) as { id: string; email: string } | null;
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid session' });
  }

  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) {
    return res.status(400).json({ success: false, error: 'Missing endpoint' });
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        userId: decoded.id,
      },
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Unsubscribe error:', err);
    return res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
  }
}
