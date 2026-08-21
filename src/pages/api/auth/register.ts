// src/pages/api/auth/register.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';
import { generateAccessToken } from '@/lib/auth/jwt';
import { OtpService } from '@/lib/auth/otp.service';
import { logger } from '@/lib/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

interface RegisterState {
  email: string;
  name: string;
  password?: string;
  phoneNumber?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { step } = req.body as { step?: 'initiate' | 'verify-email' };
  if (!step) {
    return res.status(400).json({ success: false, error: 'Registration step is required.' });
  }

  try {
    // ── STEP 1: Initiate Registration & Request Email OTP ─────────────────────
    if (step === 'initiate') {
      const { email, name, password, phoneNumber } = req.body as {
        email?: string;
        name?: string;
        password?: string;
        phoneNumber?: string;
      };

      if (!email || !name || !password) {
        return res.status(400).json({ success: false, error: 'Email, name, and password are required.' });
      }

      const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'User with this email already exists.' });
      }

      const userId = `pending-${email.toLowerCase()}`;
      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      const otpRes = await OtpService.requestOtp({
        userId,
        email,
        channel: 'email',
        destination: email,
        ip,
        userAgent,
      });

      if (!otpRes.success) {
        return res.status(400).json({ success: false, error: otpRes.error });
      }

      const stateToken = jwt.sign(
        { email: email.toLowerCase(), name, password, phoneNumber } as RegisterState,
        JWT_SECRET,
        { expiresIn: '15m' }
      );

      return res.status(200).json({
        success: true,
        message: 'OTP sent to your email.',
        stateToken,
      });
    }

    // ── STEP 2: Verify Email OTP & Create User ──────────────────────────────
    if (step === 'verify-email') {
      const { otp, stateToken } = req.body as { otp?: string; stateToken?: string };
      if (!otp || !stateToken) {
        return res.status(400).json({ success: false, error: 'OTP and state token are required.' });
      }

      let state: RegisterState;
      try {
        state = jwt.verify(stateToken, JWT_SECRET) as RegisterState;
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid or expired registration session.' });
      }

      const userId = `pending-${state.email}`;

      const verifyRes = await OtpService.verifyOtp({
        userId,
        channel: 'email',
        otp,
        email: state.email,
        ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
      });

      if (!verifyRes.success) {
        return res.status(400).json({ success: false, error: verifyRes.error });
      }

      const existingUser = await prisma.user.findUnique({ where: { email: state.email } });
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'User already exists.' });
      }

      const user = await prisma.user.create({
        data: {
          email: state.email,
          name: state.name,
          password: state.password || 'TemporaryPassword',
          phoneNumber: state.phoneNumber || null,
        },
      });

      await prisma.auditLog.create({
        data: {
          username: user.email,
          action: 'USER_REGISTERED',
          entity: 'User',
          entityId: user.id,
          details: `User registered successfully. IP: ${req.socket.remoteAddress || 'unknown'}`,
          userId: user.id,
        },
      });

      const token = generateAccessToken({ id: user.id, email: user.email, name: user.name, role: user.role });
      const isProd = process.env.NODE_ENV === 'production';

      res.setHeader(
        'Set-Cookie',
        `auth_token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict${isProd ? '; Secure' : ''}`,
      );

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          phoneNumber: user.phoneNumber,
        },
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid registration step.' });
  } catch (error) {
    logger.error(`Registration error: ${(error as Error).message}`);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
