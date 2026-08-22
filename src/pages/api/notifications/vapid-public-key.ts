import type { NextApiRequest, NextApiResponse } from 'next';
import { getVapidPublicKey } from '@/lib/web-push-server';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const publicKey = getVapidPublicKey();
  return res.status(200).json({ success: true, publicKey });
}
