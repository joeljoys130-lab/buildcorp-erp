// src/pages/api/auth/login.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import bcrypt from 'bcrypt';
import { findUser } from '@/lib/auth/users';
import { OtpService } from '@/lib/auth/otp.service';

/**
 * POST /api/auth/login
 * Body: { username: string; password: string }
 *
 * SERVER-SIDE STRICT PASSWORD VALIDATION:
 * 1. Validates username & password input presence.
 * 2. Resolves registered user from database/registry.
 * 3. Verifies submitted password against stored password/hash using bcrypt.
 * 4. REJECTS request immediately with 401 if password is wrong (NO OTP GENERATED/SENT).
 * 5. ONLY upon successful password verification, generates & dispatches Email OTP.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }

  const user = await findUser(username.trim());
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  // Authoritative server-side password check (supports bcrypt hashes & seed credentials)
  let isPasswordValid = false;
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isPasswordValid = await bcrypt.compare(password, user.password);
  } else {
    isPasswordValid = (user.password === password);
  }

  if (!isPasswordValid) {
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  }

  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  // ONLY generate & dispatch Email OTP after password validation succeeds
  const otpRes = await OtpService.requestOtp({
    userId: user.id,
    email: user.email,
    ip,
    userAgent,
  });

  if (!otpRes.success) {
    return res.status(400).json({ success: false, error: otpRes.error || 'Failed to send Email OTP' });
  }

  return res.status(200).json({
    success: true,
    step: 'otp',
    email: user.email,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}
