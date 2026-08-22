import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { evaluateAndNotifyDlpEvents } from '@/lib/dlp-notifier';
import { verifyAccessToken } from '@/lib/auth/jwt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  let isCronAuthorized = false;
  let userOrgId: string | undefined = undefined;
  let isAuthenticatedUser = false;

  if (cronSecret && authHeader && authHeader.startsWith('Bearer ')) {
    const providedSecret = authHeader.substring(7);
    const a = Buffer.from(providedSecret);
    const b = Buffer.from(cronSecret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      isCronAuthorized = true;
    }
  }

  if (!isCronAuthorized) {
    const token = req.cookies.auth_token;
    if (token) {
      const decoded = verifyAccessToken(token) as { id: string; organizationId?: string } | null;
      if (decoded) {
        isAuthenticatedUser = true;
        userOrgId = decoded.organizationId;
      }
    }
  }

  if (!isCronAuthorized && !isAuthenticatedUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized evaluation request' });
  }

  try {
    const results = await evaluateAndNotifyDlpEvents(isCronAuthorized ? undefined : userOrgId);
    return res.status(200).json({
      success: true,
      message: 'DLP notification evaluation completed',
      results,
    });
  } catch (err: any) {
    console.error('DLP evaluation failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to evaluate DLP notifications' });
  }
}
