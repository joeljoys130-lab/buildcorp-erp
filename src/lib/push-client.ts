// Client-side Web Push Utilities for BuildCorp ERP

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermissionState(): 'default' | 'granted' | 'denied' | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch (err) {
    console.error('Service Worker registration failed:', err);
    return null;
  }
}

export async function subscribeUserToPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Web Push Notifications are not supported by this browser.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'denied') {
      return { success: false, error: 'Browser notifications are blocked. Please enable them in browser site settings.' };
    }
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was not granted.' };
    }

    const swRegistration = await registerServiceWorker();
    if (!swRegistration) {
      return { success: false, error: 'Service worker registration failed.' };
    }

    // Fetch VAPID Public Key from API
    const resKey = await fetch('/api/notifications/vapid-public-key');
    const dataKey = await resKey.json();

    if (!dataKey.success || !dataKey.publicKey) {
      return { success: false, error: 'Failed to retrieve VAPID public key from server.' };
    }

    const applicationServerKey = urlBase64ToUint8Array(dataKey.publicKey);

    // Get existing subscription or create new
    let subscription = await swRegistration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    // Send subscription payload to backend API
    const subPayload = JSON.parse(JSON.stringify(subscription));
    const subRes = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subPayload }),
    });

    const subData = await subRes.json();
    if (!subData.success) {
      return { success: false, error: subData.error || 'Failed to save subscription on server.' };
    }

    // Trigger immediate DLP evaluation check
    void fetch('/api/notifications/evaluate-dlp', { method: 'POST' }).catch(() => {});

    return { success: true };
  } catch (err: any) {
    console.error('Subscribe user failed:', err);
    return { success: false, error: err?.message || 'An unexpected error occurred during subscription.' };
  }
}

export async function unsubscribeUserFromPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: true };
  try {
    const swRegistration = await navigator.serviceWorker.ready;
    const subscription = await swRegistration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Unsubscribe failed:', err);
    return { success: false, error: err?.message || 'Failed to unsubscribe.' };
  }
}
