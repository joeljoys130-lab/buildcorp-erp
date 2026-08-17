/**
 * src/lib/auth/users.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for registered users, backed by MongoDB.
 * Seeds hardcoded admin/test users on demand.
 */

import prisma from '../prisma';

export interface RegisteredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  password: string;
  phoneNumber?: string | null;
  isPhoneVerified?: boolean;
  preferredOtpMethod?: string;
  lastOtpMethod?: string | null;
}

/** Hardcoded fallback seed users */
export const REGISTERED_USERS: Record<string, Omit<RegisteredUser, 'phoneNumber' | 'isPhoneVerified' | 'preferredOtpMethod' | 'lastOtpMethod'>> = {
  'thomasjosephkidarathil@gmail.com': {
    id: 'u-thomas',
    email: 'thomasjosephkidarathil@gmail.com',
    name: 'Thomas Joseph',
    role: 'ADMIN',
    password: 'Thomas@erp',
  },
  'test@buildcorp.com': {
    id: 'u-test',
    email: 'test@buildcorp.com',
    name: 'Test User',
    role: 'ADMIN',
    password: 'Password',
  },
};

/**
 * Ensures that a user is in the database (seeding if necessary).
 * Gracefully falls back to REGISTERED_USERS if the DB is unreachable.
 */
async function ensureDbUser(email: string): Promise<RegisteredUser | null> {
  const normEmail = email.toLowerCase();

  try {
    // Try database lookup first
    let user = await prisma.user.findUnique({ where: { email: normEmail } });

    // If not found in DB but exists in hardcoded config, seed it
    if (!user) {
      const fallback = REGISTERED_USERS[normEmail];
      if (fallback) {
        try {
          user = await prisma.user.create({
            data: {
              id: fallback.id,
              email: fallback.email,
              name: fallback.name,
              role: fallback.role,
              password: fallback.password,
              phoneNumber: normEmail === 'test@buildcorp.com' ? '+918590591987' : normEmail === 'thomasjosephkidarathil@gmail.com' ? '+919633864150' : null,
              isPhoneVerified: normEmail === 'test@buildcorp.com' || normEmail === 'thomasjosephkidarathil@gmail.com',
              preferredOtpMethod: 'email',
            },
          });
        } catch {
          // Seeding failed (e.g. duplicate key from a race condition) — try a fresh lookup
          user = await prisma.user.findUnique({ where: { email: normEmail } });
        }
      }
    } else {
      // Force update phone number if it doesn't match the expected value
      if (normEmail === 'test@buildcorp.com' && user.phoneNumber !== '+918590591987') {
        user = await prisma.user.update({
          where: { email: normEmail },
          data: { phoneNumber: '+918590591987', isPhoneVerified: true },
        });
      } else if (normEmail === 'thomasjosephkidarathil@gmail.com' && user.phoneNumber !== '+919633864150') {
        user = await prisma.user.update({
          where: { email: normEmail },
          data: { phoneNumber: '+919633864150', isPhoneVerified: true },
        });
      }
    }

    return user ? (user as unknown as RegisteredUser) : null;
  } catch (dbErr) {
    // DB unreachable — fall back to hardcoded registry so login still works
    console.warn('⚠️  DB unavailable in ensureDbUser, using hardcoded fallback:', (dbErr as Error).message?.slice(0, 120));
    const fallback = REGISTERED_USERS[normEmail];
    if (!fallback) return null;
    return {
      ...fallback,
      phoneNumber: normEmail === 'test@buildcorp.com' ? '+918590591987' : normEmail === 'thomasjosephkidarathil@gmail.com' ? '+919633864150' : null,
      isPhoneVerified: normEmail === 'test@buildcorp.com' || normEmail === 'thomasjosephkidarathil@gmail.com',
      preferredOtpMethod: 'email',
      lastOtpMethod: null,
    } as RegisteredUser;
  }
}

/** Look up a user by email. Returns null/undefined if not registered. */
export async function findUserByEmail(email: string): Promise<RegisteredUser | undefined> {
  const user = await ensureDbUser(email);
  return user || undefined;
}

/** Look up a user by username or email. Returns null/undefined if not found. */
export async function findUser(usernameOrEmail: string): Promise<RegisteredUser | undefined> {
  // Try by email first
  const byEmail = await ensureDbUser(usernameOrEmail);
  if (byEmail) return byEmail;

  try {
    // Try by matching username prefix in the DB
    const prefix = usernameOrEmail.toLowerCase();
    const dbUser = await prisma.user.findFirst({
      where: {
        email: {
          startsWith: prefix + '@',
          mode: 'insensitive',
        },
      },
    });

    if (dbUser) {
      return dbUser as unknown as RegisteredUser;
    }
  } catch {
    // DB unavailable — fall through to hardcoded search below
  }

  // Fallback to searching REGISTERED_USERS by username prefix
  const prefix = usernameOrEmail.toLowerCase();
  const foundFallback = Object.values(REGISTERED_USERS).find(
    (u) => u.email.split('@')[0].toLowerCase() === prefix,
  );
  if (foundFallback) {
    return (await ensureDbUser(foundFallback.email)) || undefined;
  }

  return undefined;
}

