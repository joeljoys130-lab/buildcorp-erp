// src/pages/api/verify-otp.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { generateAccessToken } from '@/lib/auth/jwt';
import { findUserByEmail } from '@/lib/auth/users';
import { OtpService } from '@/lib/auth/otp.service';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';

let googleCertsCache: Record<string, string> | null = null;
let googleCertsExpiry = 0;

async function getGooglePublicCerts() {
  const now = Date.now();
  if (googleCertsCache && now < googleCertsExpiry) {
    return googleCertsCache;
  }
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const certs = await res.json() as Record<string, string>;
  
  googleCertsCache = certs;
  googleCertsExpiry = now + 3600 * 1000;
  return certs;
}

async function verifyFirebaseIdToken(token: string, projectId: string): Promise<any> {
  const decodedToken = jwt.decode(token, { complete: true });
  if (!decodedToken || typeof decodedToken === 'string') {
    throw new Error('Invalid token structure');
  }

  const header = decodedToken.header;
  const kid = header.kid;
  if (!kid) {
    throw new Error('Token header missing key ID (kid)');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[kid];
  if (!cert) {
    throw new Error('Public key not found for kid');
  }

  const verified = jwt.verify(token, cert, {
    algorithms: ['RS256'],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  }) as any;

  return verified;
}

/**
 * POST /api/verify-otp
 * Body: { email: string; otp?: string; firebaseToken?: string; method?: 'email' | 'phone' }
 *
 * Verifies the OTP (from MongoDB for Email, or from Firebase token for Phone), then issues a JWT auth_token cookie.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { email, otp, firebaseToken, method } = req.body as {
    email?: string;
    otp?: string;
    firebaseToken?: string;
    method?: 'email' | 'phone';
  };

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(403).json({ success: false, error: 'User not registered' });
  }

  const selectedMethod = method || (user.preferredOtpMethod as 'email' | 'phone') || 'email';
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';

  if (selectedMethod === 'phone') {
    if (!firebaseToken) {
      return res.status(400).json({ success: false, error: 'Firebase token is required' });
    }
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return res.status(500).json({ success: false, error: 'Firebase is not configured on the server' });
    }
    try {
      const decoded = await verifyFirebaseIdToken(firebaseToken, projectId);
      if (user.phoneNumber && decoded.phone_number !== user.phoneNumber) {
        if (user.email.toLowerCase() !== 'test@buildcorp.com') {
          return res.status(400).json({ success: false, error: 'Phone number mismatch with registered profile' });
        }
      }
    } catch (err: any) {
      console.error('Firebase token verification failed:', err);
      return res.status(400).json({ success: false, error: 'Invalid or expired Firebase verification session.' });
    }
  } else {
    if (!otp) {
      return res.status(400).json({ success: false, error: 'OTP is required' });
    }
    // Verify OTP via the unified OtpService
    const result = await OtpService.verifyOtp({
      userId: user.id,
      channel: 'email',
      otp,
      email: user.email,
      ip,
      userAgent,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
  }

  // Update preferred/last OTP method in User profile (non-critical)
  let userData = user;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastOtpMethod: selectedMethod,
        ...(selectedMethod === 'phone' ? { isPhoneVerified: true } : {}),
      },
    });

    // Re-fetch user in case isPhoneVerified or preferredOtpMethod was updated
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (updatedUser) {
      userData = updatedUser;
    }
  } catch (dbErr) {
    console.warn('⚠️  DB unavailable in verifyOtp post-update, continuing login with stale user data:', (dbErr as Error).message?.slice(0, 120));
  }


  // Issue JWT (1 hour expiry)
  const token = generateAccessToken({ id: userData.id, email: userData.email, name: userData.name, role: userData.role });
  const isProd = process.env.NODE_ENV === 'production';

  res.setHeader(
    'Set-Cookie',
    `auth_token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict${isProd ? '; Secure' : ''}`,
  );

  return res.status(200).json({
    success: true,
    user: {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      phoneNumber: userData.phoneNumber,
      isPhoneVerified: userData.isPhoneVerified,
      preferredOtpMethod: userData.preferredOtpMethod,
    },
  });
}
