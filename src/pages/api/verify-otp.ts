// src/pages/api/verify-otp.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { generateAccessToken } from '@/lib/auth/jwt';
import { findUserByEmail, findUser } from '@/lib/auth/users';
import { OtpService } from '@/lib/auth/otp.service';

/**
 * POST /api/verify-otp
 * Body: { email: string; otp: string }
 *
 * Verifies Email OTP against stored hash or dev test OTP guard,
 * then issues HttpOnly JWT auth_token cookie.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  const normEmail = email.toLowerCase().trim();
  const user = (await findUserByEmail(normEmail)) || (await findUser(normEmail));
  if (!user) {
    return res.status(403).json({ success: false, error: 'User not registered' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  const result = await OtpService.verifyOtp({
    userId: user.id,
    otp: otp.trim(),
    email: user.email,
    ip,
    userAgent,
  });

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error || 'Invalid verification code.' });
  }

  // Issue JWT (1 hour expiry) with organizationId for zero-latency tenant context resolution
  const token = generateAccessToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: (user as any).organizationId || 'org-default',
  });
  const isProd = process.env.NODE_ENV === 'production';

  // Set SameSite=Lax so cookie is sent on top-level navigation to / or /dashboard
  res.setHeader(
    'Set-Cookie',
    `auth_token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax${isProd ? '; Secure' : ''}`,
  );

  return res.status(200).json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}
