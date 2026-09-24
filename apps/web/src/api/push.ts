import { api } from './client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function ensureServiceWorker() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

export async function enablePush(): Promise<'granted' | 'denied' | 'unsupported' | 'default'> {
  if (!pushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  const { publicKey, enabled } = await api<{ publicKey: string | null; enabled: boolean }>(
    '/push/vapid-public-key',
    { auth: false },
  );
  if (!enabled || !publicKey) {
    throw new Error('Web Push на сервере не настроен (нет VAPID ключей)');
  }

  const reg = await ensureServiceWorker();
  if (!reg) return 'unsupported';

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Некорректная push-подписка');
  }

  await api('/push/subscribe', {
    method: 'POST',
    json: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    },
  });

  return 'granted';
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try {
      await api('/push/subscribe', {
        method: 'DELETE',
        json: { endpoint: sub.endpoint },
      });
    } catch {
      /* ignore */
    }
    await sub.unsubscribe();
  }
}

export async function isPushSubscribed() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}
