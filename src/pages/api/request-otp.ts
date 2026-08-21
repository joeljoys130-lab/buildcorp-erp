// src/pages/api/request-otp.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { findUserByEmail } from '@/lib/auth/users';
import { OtpService } from '@/lib/auth/otp.service';

/**
 * POST /api/request-otp
 * Generates a 6-digit OTP, saves it to MongoDB, and sends it via Email.
 * Accept body: { email: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { email } = req.body as { email?: string };
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(200).json({ success: true, message: 'If registered, an Email OTP will be sent.' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  try {
    const result = await OtpService.requestOtp({
      userId: user.id,
      email: user.email,
      ip,
      userAgent,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your registered email.',
    });
  } catch (err) {
    console.error('❌ Failed to request OTP:', (err as Error).message);
    return res.status(500).json({
      success: false,
      error: 'Failed to request OTP. Please try again.',
    });
  }
}
