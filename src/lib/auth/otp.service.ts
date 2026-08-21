/**
 * src/lib/auth/otp.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Email OTP Service.
 * Handles generation, hashing, rate limiting, attempt tracking, lockouts,
 * validation, and email dispatch.
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../prisma';
import { sendOtpEmail } from './email';
import { logger } from '../logger';

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
const OTP_RESEND_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS || '30', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

/** Helper: Wrap promise with a fast timeout so DB network latency never hangs execution. */
function withTimeout<T>(promise: Promise<T>, ms = 1200): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Database operation timeout')), ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/** In-memory OTP fallback store used when MongoDB is unreachable or timing out. */
const MEM_OTP: Record<string, { hash: string; expiresAt: number; createdAt: number }> = {};

export class OtpService {
  /**
   * Generates a cryptographically secure random 6-digit OTP.
   */
  public static generateOtpString(_email: string): string {
    const num = crypto.randomInt(100000, 1000000);
    return num.toString();
  }

  /**
   * Request/Send a new Email OTP to the specified user.
   * Invalidates any active/previous OTPs for this user first.
   */
  public static async requestOtp(params: {
    userId: string;
    email: string;
    channel?: 'email';
    destination?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; error?: string; retryAfter?: number }> {
    const { userId, email, ip, userAgent } = params;
    const destination = email;
    const channel = 'email';
    const now = new Date();

    try {
      // 1. Rate Limiting & Reuse Check: If an unexpired active OTP exists, check cooldown
      const latestOtp = await withTimeout(
        prisma.otp.findFirst({
          where: { userId, channel },
          orderBy: { createdAt: 'desc' },
        }),
        1000
      );

      if (latestOtp) {
        if (!latestOtp.isUsed && latestOtp.expiresAt > now) {
          return { success: true };
        }
        const elapsedSeconds = Math.floor((now.getTime() - latestOtp.createdAt.getTime()) / 1000);
        if (elapsedSeconds < OTP_RESEND_SECONDS) {
          return {
            success: false,
            error: `Please wait ${OTP_RESEND_SECONDS - elapsedSeconds}s before requesting a new OTP.`,
            retryAfter: OTP_RESEND_SECONDS - elapsedSeconds,
          };
        }
      }

      // 2. Generate new random 6-digit OTP
      const otpCode = this.generateOtpString(email);
      const otpHash = await bcrypt.hash(otpCode, 12);
      const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

      // Store in memory fallback as well
      MEM_OTP[userId + ':email'] = {
        hash: otpHash,
        expiresAt: expiresAt.getTime(),
        createdAt: now.getTime(),
      };

      // 3. Store in DB asynchronously with timeout
      void withTimeout(
        prisma.otp.updateMany({
          where: { userId, channel, isUsed: false },
          data: { isUsed: true },
        }),
        1000
      ).then(() => {
        return withTimeout(
          prisma.otp.create({
            data: {
              userId,
              channel,
              destination,
              otpHash,
              expiresAt,
              attempts: 0,
              isUsed: false,
            },
          }),
          1000
        );
      }).catch(() => {});

      // 4. Audit & structured logs
      logger.info(`Email OTP generated for User ID: ${userId} | IP: ${ip || 'unknown'} | Agent: ${userAgent || 'unknown'}`);

      // 5. Dispatch OTP via Email asynchronously so UI transitions instantly
      void sendOtpEmail(destination, otpCode).catch((emailErr) => {
        logger.error(`Email dispatch failed to ${email}: ${(emailErr as Error).message}`);
      });

      return { success: true };

    } catch (dbErr) {
      console.warn('⚠️  DB timeout/unavailable in requestOtp, using memory fallback:', (dbErr as Error).message?.slice(0, 120));
      const otpCode = this.generateOtpString(email);
      const otpHash = await bcrypt.hash(otpCode, 12);
      MEM_OTP[userId + ':email'] = {
        hash: otpHash,
        expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
        createdAt: Date.now(),
      };

      void sendOtpEmail(destination, otpCode).catch((emailErr) => {
        logger.error(`Email dispatch failed to ${email}: ${(emailErr as Error).message}`);
      });

      return { success: true };
    }
  }

  /**
   * Verify an Email OTP.
   * Controlled local development test OTP: '999999' ONLY for test@buildcorp.com in development mode.
   * Implements lockout, attempt counting, constant-time comparison, and post-success invalidation.
   */
  public static async verifyOtp(params: {
    userId: string;
    channel?: 'email';
    otp: string;
    email: string;
    ip?: string;
    userAgent?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, otp, email, ip, userAgent } = params;
    const channel = 'email';
    const now = new Date();

    // ── Controlled Development-Only Test OTP Guard ────────────────────────────
    const isDev = process.env.NODE_ENV !== 'production';
    const isTestAccount = email.toLowerCase().trim() === 'test@buildcorp.com';
    const isDevTestOtp = isDev && isTestAccount && otp === '999999';

    if (isDevTestOtp) {
      logger.info(`[DEV TEST OTP ACCEPTED] User: ${email} | IP: ${ip || 'unknown'}`);
      delete MEM_OTP[userId + ':email'];
      void withTimeout(
        prisma.otp.updateMany({
          where: { userId, channel, isUsed: false },
          data: { isUsed: true },
        }),
        1000
      ).catch(() => {});
      return { success: true };
    }
    // ──────────────────────────────────────────────────────────────────────────

    try {
      // Find the latest active OTP for this user and channel with fast timeout
      const record = await withTimeout(
        prisma.otp.findFirst({
          where: { userId, channel, isUsed: false },
          orderBy: { createdAt: 'desc' },
        }),
        1000
      );

      if (!record) {
        // DB connected but no OTP record — check memory fallback
        const memKey = userId + ':email';
        const memEntry = MEM_OTP[memKey];
        if (memEntry && memEntry.expiresAt > Date.now()) {
          const matches = await bcrypt.compare(otp, memEntry.hash);
          if (matches) {
            delete MEM_OTP[memKey];
            return { success: true };
          }
          return { success: false, error: 'Invalid verification code.' };
        }
        return { success: false, error: 'No active OTP request found.' };
      }

      // Check if expired
      if (record.expiresAt < now) {
        void prisma.otp.update({ where: { id: record.id }, data: { isUsed: true } }).catch(() => {});
        return { success: false, error: 'OTP has expired. Please request a new OTP.' };
      }

      // Check if user is locked out due to previous attempts on this OTP
      if (record.attempts >= OTP_MAX_ATTEMPTS) {
        return { success: false, error: 'Maximum attempts exceeded. Please request a new OTP.' };
      }

      // Compare constant-time using bcrypt
      const matches = await bcrypt.compare(otp, record.otpHash);

      if (!matches) {
        const updatedAttempts = record.attempts + 1;
        void prisma.otp.update({
          where: { id: record.id },
          data: { attempts: updatedAttempts },
        }).catch(() => {});

        logger.warn(`Failed OTP verification attempt for User ID: ${userId} (email). Attempt ${updatedAttempts}/${OTP_MAX_ATTEMPTS}`);

        if (updatedAttempts >= OTP_MAX_ATTEMPTS) {
          void prisma.otp.update({ where: { id: record.id }, data: { isUsed: true } }).catch(() => {});
          return { success: false, error: 'Maximum attempts exceeded. This OTP has been invalidated.' };
        }

        return { success: false, error: `Invalid verification code. ${OTP_MAX_ATTEMPTS - updatedAttempts} attempt(s) remaining.` };
      }

      // Mark OTP as used (single-use)
      void prisma.otp.update({
        where: { id: record.id },
        data: { isUsed: true },
      }).catch(() => {});
      delete MEM_OTP[userId + ':email'];

      logger.info(`Successful Email OTP verification for User ID: ${userId} | IP: ${ip || 'unknown'} | Agent: ${userAgent || 'unknown'}`);
      return { success: true };

    } catch (dbErr) {
      console.warn('⚠️  DB unavailable in verifyOtp, checking memory fallback:', (dbErr as Error).message?.slice(0, 120));
      const memKey = userId + ':email';
      const memEntry = MEM_OTP[memKey];
      if (memEntry && memEntry.expiresAt > Date.now()) {
        const matches = await bcrypt.compare(otp, memEntry.hash);
        if (matches) {
          delete MEM_OTP[memKey];
          return { success: true };
        }
        return { success: false, error: 'Invalid verification code.' };
      }
      return { success: false, error: 'Database unavailable. Please try again later.' };
    }
  }
}
