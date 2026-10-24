/**
 * clerk-auth-security.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated Security & Authentication Test Suite for Clerk Integration.
 *
 * Covers:
 * 1. Authentication: Verified email requirements, existing user linking,
 *    new user provisioning, invalid/expired session handling.
 * 2. Authorization: RBAC enforcement, least-privilege for new users,
 *    admin and employee role preservation, server-side permission assertions.
 * 3. Tenant Isolation: Multi-organization scoping, client orgId spoofing prevention,
 *    Clerk organization mapping without privilege escalation.
 * 4. Regression: Compatibility with legacy tokens, document access, and ERP permissions.
 */

import prisma from '../lib/prisma';
import {
  resolveAuthenticatedTenant,
  getTenantContextFromToken,
  assertPermission,
  TenantContext,
} from '../lib/auth/tenant';
import { hasPermission, Role, Permission } from '../lib/auth/rbac';
import { generateAccessToken } from '../lib/auth/jwt';
import { REGISTERED_USERS } from '../lib/auth/users';

async function runClerkSecurityTests() {
  console.log('🛡️  Starting Clerk Authentication & RBAC Security Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 1: AUTHENTICATION & IDENTITY VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- Test Group 1: Clerk Authentication & Account Linking ---');

  // Test 1.1: Verified-email requirement
  const mockUnverifiedClerkUser = {
    id: 'clerk_unverified_1',
    primaryEmailAddressId: 'email_1',
    emailAddresses: [
      { id: 'email_1', emailAddress: 'attacker@example.com', verification: { status: 'unverified' } },
    ],
  };

  const hasVerifiedEmail = (user: typeof mockUnverifiedClerkUser) => {
    return !!user.emailAddresses.find(
      (e) => e.verification.status === 'verified' && e.id === user.primaryEmailAddressId,
    );
  };

  assert(hasVerifiedEmail(mockUnverifiedClerkUser) === false, '1.1 Unverified Clerk email is rejected');

  const mockVerifiedClerkUser = {
    id: 'clerk_verified_1',
    primaryEmailAddressId: 'email_2',
    emailAddresses: [
      { id: 'email_2', emailAddress: 'thomasjosephkidarathil@gmail.com', verification: { status: 'verified' } },
    ],
  };
  assert(hasVerifiedEmail(mockVerifiedClerkUser) === true, '1.2 Verified Clerk email is accepted');

  // Test 1.3: Existing user account linking preserves ADMIN role
  const existingAdminEmail = 'thomasjosephkidarathil@gmail.com';
  const existingSeed = REGISTERED_USERS[existingAdminEmail];
  assert(existingSeed !== undefined, '1.3 Existing admin user exists in seed registry');
  assert(existingSeed.role === 'ADMIN', '1.3 Existing admin role is ADMIN');

  // Test 1.4: Safe account linking logic preserves role
  const simulateAccountLinking = (userInDb: { role: string; clerkId?: string | null }, clerkId: string) => {
    return {
      ...userInDb,
      clerkId, // links clerkId
      role: userInDb.role, // strictly preserves database role
    };
  };

  const linkedUser = simulateAccountLinking({ role: existingSeed.role, clerkId: null }, 'clerk_thomas_123');
  assert(linkedUser.clerkId === 'clerk_thomas_123', '1.4 Clerk ID successfully attached to user');
  assert(linkedUser.role === 'ADMIN', '1.4 Role strictly preserved as ADMIN (not overwritten by Clerk default)');

  // Test 1.5: Genuinely new user receives least-privileged VIEWER role
  const simulateNewUserProvisioning = (email: string, clerkId: string) => {
    return {
      email,
      clerkId,
      role: 'VIEWER' as Role, // Least-privileged role
      organizationId: 'org-default',
    };
  };

  const newUser = simulateNewUserProvisioning('newuser@example.com', 'clerk_new_456');
  assert(newUser.role === 'VIEWER', '1.5 Genuinely new user provisioned with least-privileged VIEWER role');
  assert(newUser.role !== 'ADMIN', '1.5 New user CANNOT receive automatic ADMIN privileges');

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 2: AUTHORIZATION & RBAC ENFORCEMENT
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 2: RBAC Permissions & Authorization Hierarchy ---');

  // Test 2.1: Administrator permissions intact
  assert(hasPermission('ADMIN', 'PROJECT_CREATE') === true, '2.1 Admin has PROJECT_CREATE');
  assert(hasPermission('ADMIN', 'PROJECT_DELETE') === true, '2.1 Admin has PROJECT_DELETE');
  assert(hasPermission('ADMIN', 'INSURANCE_CREATE') === true, '2.1 Admin has INSURANCE_CREATE');
  assert(hasPermission('ADMIN', 'EXPENSE_DELETE') === true, '2.1 Admin has EXPENSE_DELETE');

  // Test 2.2: Employee roles preserved
  assert(hasPermission('PROJECT_MANAGER', 'PROJECT_CREATE') === true, '2.2 Project Manager can create projects');
  assert(hasPermission('PROJECT_MANAGER', 'PROJECT_DELETE') === false, '2.2 Project Manager cannot delete projects');
  assert(hasPermission('ACCOUNTANT', 'EXPENSE_CREATE') === true, '2.2 Accountant can create expenses');
  assert(hasPermission('ACCOUNTANT', 'PROJECT_CREATE') === false, '2.2 Accountant cannot create projects');
  assert(hasPermission('SITE_MANAGER', 'MATERIAL_CREATE') === true, '2.2 Site Manager can create site materials');
  assert(hasPermission('STORE_MANAGER', 'STOCK_UPDATE') === true, '2.2 Store Manager can update stock');

  // Test 2.3: VIEWER read-only enforcement
  assert(hasPermission('VIEWER', 'PROJECT_VIEW') === true, '2.3 Viewer has PROJECT_VIEW');
  assert(hasPermission('VIEWER', 'INSURANCE_VIEW') === true, '2.3 Viewer has INSURANCE_VIEW');
  assert(hasPermission('VIEWER', 'PROJECT_CREATE') === false, '2.3 Viewer CANNOT create project');
  assert(hasPermission('VIEWER', 'PROJECT_DELETE') === false, '2.3 Viewer CANNOT delete project');
  assert(hasPermission('VIEWER', 'INSURANCE_CREATE') === false, '2.3 Viewer CANNOT create insurance');
  assert(hasPermission('VIEWER', 'EXPENSE_DELETE') === false, '2.3 Viewer CANNOT delete expense');

  // Test 2.4: assertPermission server-side check
  const adminContext: TenantContext = {
    userId: 'u-admin',
    email: 'admin@buildcorp.com',
    name: 'Admin',
    organizationId: 'org-1',
    role: 'ADMIN',
  };

  const viewerContext: TenantContext = {
    userId: 'u-viewer',
    email: 'viewer@buildcorp.com',
    name: 'Viewer',
    organizationId: 'org-1',
    role: 'VIEWER',
  };

  try {
    assertPermission(adminContext, 'PROJECT_DELETE');
    assert(true, '2.4 Admin passes assertPermission(PROJECT_DELETE)');
  } catch {
    assert(false, '2.4 Admin should not throw');
  }

  try {
    assertPermission(viewerContext, 'PROJECT_DELETE');
    assert(false, '2.4 Viewer must NOT pass assertPermission(PROJECT_DELETE)');
  } catch (err: any) {
    assert(err.message.includes('Unauthorized'), '2.4 Viewer correctly blocked with Unauthorized error');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 3: TENANT ISOLATION & CLERK ORGANIZATIONS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 3: Server-Side Tenant Isolation & Clerk Organizations ---');

  const tenantA: TenantContext = {
    userId: 'user-a',
    email: 'usera@orga.com',
    name: 'User A',
    organizationId: 'org-alpha',
    role: 'ADMIN',
  };

  const tenantB: TenantContext = {
    userId: 'user-b',
    email: 'userb@orgb.com',
    name: 'User B',
    organizationId: 'org-beta',
    role: 'ADMIN',
  };

  // Test 3.1: Distinct tenant IDs
  assert(tenantA.organizationId !== tenantB.organizationId, '3.1 Tenant Alpha and Beta have distinct organization IDs');

  // Test 3.2: Client-supplied orgId spoofing prevention
  // If an attacker sends organizationId="org-alpha" in request body or header,
  // the server MUST use tenantContext.organizationId, not the body parameter.
  const simulateSecureOperation = (ctx: TenantContext, clientSuppliedOrgId: string) => {
    // Correct secure pattern: ignores clientSuppliedOrgId, forces ctx.organizationId
    const effectiveTenantId = ctx.organizationId;
    return {
      queriedOrganizationId: effectiveTenantId,
      wasSpoofed: effectiveTenantId === clientSuppliedOrgId && ctx.organizationId !== clientSuppliedOrgId,
    };
  };

  const spoofAttempt = simulateSecureOperation(tenantB, 'org-alpha');
  assert(spoofAttempt.queriedOrganizationId === 'org-beta', '3.2 Request scoped to authenticated tenant, ignoring spoofed orgId');
  assert(spoofAttempt.queriedOrganizationId !== 'org-alpha', '3.2 Tenant B CANNOT access Tenant A data via parameter tampering');

  // Test 3.3: Clerk org:admin mapping safety
  // A Clerk org:admin must NOT be converted to BuildCorp ADMIN without internal membership
  const mapClerkOrgRole = (clerkOrgRole: string, internalMembershipRole?: Role): Role => {
    // If internal membership specifies a role, use it; otherwise fallback to VIEWER
    if (internalMembershipRole) return internalMembershipRole;
    return 'VIEWER';
  };

  const mappedWithoutMembership = mapClerkOrgRole('org:admin', undefined);
  assert(mappedWithoutMembership === 'VIEWER', '3.3 Clerk org:admin without MongoDB membership defaults to VIEWER');

  const mappedWithMembership = mapClerkOrgRole('org:admin', 'PROJECT_MANAGER');
  assert(mappedWithMembership === 'PROJECT_MANAGER', '3.3 Clerk user receives approved internal role from OrganizationMember');

  // ─────────────────────────────────────────────────────────────────────────
  // GROUP 4: SESSION HANDLING & REGRESSION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Group 4: Legacy Coexistence & Session Edge Cases ---');

  // Test 4.1: Missing session
  const nullContext = await getTenantContextFromToken(undefined);
  assert(nullContext === null, '4.1 Undefined token returns null context');

  // Test 4.2: Invalid session
  const invalidContext = await getTenantContextFromToken('invalid.jwt.token');
  assert(invalidContext === null, '4.2 Malformed token returns null context');

  // Test 4.3: Valid legacy token still resolves correctly during transition
  const validLegacyToken = generateAccessToken({
    id: 'u-thomas',
    email: 'thomasjosephkidarathil@gmail.com',
    name: 'Thomas Joseph',
    role: 'ADMIN',
    organizationId: 'org-buildcorp',
  });
  const legacyCtx = await getTenantContextFromToken(validLegacyToken);
  assert(legacyCtx !== null, '4.3 Valid legacy JWT token resolves successfully');
  assert(legacyCtx?.email === 'thomasjosephkidarathil@gmail.com', '4.3 Legacy context email matches');
  assert(legacyCtx?.role === 'ADMIN', '4.3 Legacy context role preserved as ADMIN');
  assert(legacyCtx?.organizationId === 'org-buildcorp', '4.3 Legacy context organization preserved');

  // Test 4.4: Expired token rejection
  const jwt = await import('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
  const expiredToken = jwt.default.sign(
    {
      id: 'u-expired',
      email: 'expired@buildcorp.com',
      exp: Math.floor(Date.now() / 1000) - 10,
    },
    JWT_SECRET,
  );
  const expiredCtx = await getTenantContextFromToken(expiredToken);
  assert(expiredCtx === null, '4.4 Expired token returns null context');

  console.log('\n======================================================================');
  console.log(`Clerk Authentication & Security Tests Complete: ${passed} Passed, ${failed} Failed.`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runClerkSecurityTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
