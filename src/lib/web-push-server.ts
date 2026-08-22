import webpush from "web-push";

let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@buildcorp.com";

// Dynamically generate a valid 65-byte VAPID keypair for dev/testing if env vars not provided
if (!vapidPublicKey || !vapidPrivateKey) {
  try {
    const keys = webpush.generateVAPIDKeys();
    if (!vapidPublicKey) vapidPublicKey = keys.publicKey;
    if (!vapidPrivateKey) vapidPrivateKey = keys.privateKey;
  } catch (err) {
    console.warn("Failed to generate VAPID keys:", err);
  }
}

try {
  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }
} catch (err) {
  console.warn("VAPID initialization warning:", err);
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || vapidPublicKey;
}

export function sendWebPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string }
) {
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || vapidPublicKey;
  const privKey = process.env.VAPID_PRIVATE_KEY || vapidPrivateKey;

  webpush.setVapidDetails(vapidSubject, pubKey, privKey);

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    }
  };

  return webpush.sendNotification(pushSubscription, JSON.stringify(payload));
}
