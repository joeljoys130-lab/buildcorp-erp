// src/pages/api/auth/profile.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/auth/jwt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. Authenticate user via JWT in HttpOnly cookie
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const decoded = verifyAccessToken(token) as { id: string; email: string; name: string } | null;
  if (!decoded) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Handle GET - Return profile details
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phoneNumber: user.phoneNumber,
      },
    });
  }

  // Handle POST/PUT - Update profile details
  if (req.method === 'POST') {
    const { name, phoneNumber } = req.body as { name?: string; phoneNumber?: string };

    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const phoneExists = await prisma.user.findFirst({
        where: { phoneNumber, NOT: { id: user.id } },
      });
      if (phoneExists) {
        return res.status(400).json({ success: false, error: 'Phone number already in use.' });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(name ? { name } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber } : {}),
      },
    });

    return res.status(200).json({
      success: true,
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        phoneNumber: updated.phoneNumber,
      },
    });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
}
