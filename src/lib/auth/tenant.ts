/**
 * tenant.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side Tenant Context Resolver.
 * Guarantees that every database operation is bound to a validated organizationId
 * derived from the authenticated JWT session — NEVER from untrusted client input.
 */

import prisma from '@/lib/prisma';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { hasPermission, Permission, Role } from './rbac';

export interface TenantContext {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: Role;
}

/**
 * Resolves the authenticated TenantContext from a raw JWT token or server cookie.
 */
export async function getTenantContextFromToken(token?: string): Promise<TenantContext | null> {
  if (!token) return null;

  const payload = verifyAccessToken(token) as { id?: string; email?: string } | null;
  if (!payload?.id || !payload?.email) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
  });

  if (!user) return null;

  let orgId = user.organizationId;
  let role = (user.role || 'ADMIN') as Role;

  // Auto-provision default organization for existing users if missing
  if (!orgId) {
    const slug = user.email.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      org = await prisma.organization.create({
        data: {
          name: `${user.name || user.email}'s Organization`,
          slug,
          plan: 'PRO',
        },
      });
    }

    orgId = org.id;

    // Create OrganizationMember record if not existing
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });

    if (!member) {
      await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          role: 'ORG_OWNER',
        },
      });
    }

    // Persist organizationId on user
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: orgId },
    });

    role = 'ORG_OWNER';
  } else {
    // Check OrganizationMember role if present
    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });
    if (member) {
      role = member.role as Role;
    }
  }

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    organizationId: orgId,
    role,
  };
}

/**
 * Enforces tenant permission check. Throws error if unauthorized.
 */
export function assertPermission(tenantContext: TenantContext, permission: Permission): void {
  if (!hasPermission(tenantContext.role, permission)) {
    throw new Error(`Unauthorized: Role '${tenantContext.role}' lacks permission '${permission}'`);
  }
}
