import prisma from "@/lib/prisma";
import { evaluateDlpStatus } from "@/lib/dlp-utils";
import { sendWebPushNotification } from "@/lib/web-push-server";

export interface DlpEvaluationSummary {
  processedEntries: number;
  usersNotified: number;
  totalPushesSent: number;
  logsCreated: number;
  subscriptionsCleaned: number;
  errors: string[];
}

export async function evaluateAndNotifyDlpEvents(targetOrganizationId?: string): Promise<DlpEvaluationSummary> {
  const whereClause: any = {};
  if (targetOrganizationId) {
    whereClause.organizationId = targetOrganizationId;
  }

  const entries = await prisma.entry.findMany({
    where: whereClause
  });

  const results: DlpEvaluationSummary = {
    processedEntries: 0,
    usersNotified: 0,
    totalPushesSent: 0,
    logsCreated: 0,
    subscriptionsCleaned: 0,
    errors: []
  };

  for (const entry of entries) {
    const dlpInfo = evaluateDlpStatus(entry as any);
    if (!dlpInfo) continue;

    // Only notify for DLP_EXPIRING_SOON and DLP_PERIOD_CROSSED
    if (!dlpInfo.isExpired && !dlpInfo.isExpiringSoon) continue;

    const notificationType = dlpInfo.isExpired ? "DLP_PERIOD_CROSSED" : "DLP_EXPIRING_SOON";
    const expiryDate = dlpInfo.dlpExpiryDate;

    // Tenant Isolation: Fetch subscriptions matching organizationId or fallback ownerEmail
    const subWhere: any = {};
    if (entry.organizationId) {
      subWhere.organizationId = entry.organizationId;
    } else if (entry.ownerEmail) {
      subWhere.ownerEmail = entry.ownerEmail;
    } else {
      continue;
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: subWhere
    });

    if (subscriptions.length === 0) continue;

    // Group subscriptions by userId for multi-device delivery & per-user idempotency
    const subsByUserId = new Map<string, typeof subscriptions>();
    for (const sub of subscriptions) {
      const userSubs = subsByUserId.get(sub.userId) || [];
      userSubs.push(sub);
      subsByUserId.set(sub.userId, userSubs);
    }

    const formatDateStr = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedExpiry = formatDateStr(expiryDate);

    let title = "";
    let body = "";

    if (notificationType === "DLP_PERIOD_CROSSED") {
      title = "DLP Period Crossed";
      body = `"${entry.workName}" DLP period has expired on ${formattedExpiry}.`;
    } else {
      title = "DLP Expiring Soon";
      body = `"${entry.workName}" DLP expires on ${formattedExpiry}. ${dlpInfo.daysRemaining} days remaining.`;
    }

    const payload = {
      title,
      body,
      icon: "/favicon.ico",
      url: "/dashboard?tab=dlp-notifications",
      tag: `dlp-${entry.id}-${notificationType}`
    };

    results.processedEntries++;

    // Evaluate per user
    for (const [userId, userSubscriptions] of subsByUserId.entries()) {
      // Check duplicate log per user
      const existingLog = await prisma.dlpNotificationLog.findUnique({
        where: {
          entryId_userId_notificationType_expiryDate: {
            entryId: entry.id,
            userId,
            notificationType,
            expiryDate
          }
        }
      });

      if (existingLog) {
        // User has already received this specific notification event on their device(s). Skip.
        continue;
      }

      let userPushesDelivered = 0;

      // Deliver to all registered devices of this user
      for (const sub of userSubscriptions) {
        try {
          await sendWebPushNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            },
            payload
          );
          userPushesDelivered++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            console.log(`[Push Clean] Removing stale subscription ID: ${sub.id} (Status: ${err.statusCode})`);
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            results.subscriptionsCleaned++;
          } else {
            console.error(`[Push Error] Failed for subscription ${sub.id}:`, err?.message || err);
            results.errors.push(`User ${userId} Sub ${sub.id}: ${err?.message || "Send failed"}`);
          }
        }
      }

      // Record DlpNotificationLog for this recipient user
      try {
        await prisma.dlpNotificationLog.create({
          data: {
            entryId: entry.id,
            userId,
            organizationId: entry.organizationId || null,
            ownerEmail: entry.ownerEmail || null,
            notificationType,
            expiryDate
          }
        });
        results.logsCreated++;
        results.usersNotified++;
        results.totalPushesSent += userPushesDelivered;
      } catch (logErr) {
        console.error(`Failed to record DlpNotificationLog for user ${userId}:`, logErr);
      }
    }
  }

  return results;
}
