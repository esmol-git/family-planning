import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { ElNotification } from 'element-plus';
import { api } from '../api/client';
import { setRealtimeHandlers } from '../api/realtime';

export type AppNotification = {
  id: string;
  userId: string;
  familyId: string | null;
  eventId: string | null;
  type: 'reminder' | 'event_updated' | 'event_cancelled';
  title: string;
  body: string;
  readAt: string | null;
  meta: unknown;
  createdAt: string;
};

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  let bound = false;

  const unread = computed(() => items.value.filter((n) => !n.readAt));

  async function load() {
    loading.value = true;
    try {
      const [list, countRes] = await Promise.all([
        api<AppNotification[]>('/notifications'),
        api<{ count: number }>('/notifications/unread-count'),
      ]);
      items.value = list;
      unreadCount.value = countRes.count;
    } finally {
      loading.value = false;
    }
  }

  async function markRead(id: string) {
    const wasUnread = items.value.find((n) => n.id === id && !n.readAt);
    const updated = await api<AppNotification>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
    const idx = items.value.findIndex((n) => n.id === id);
    if (idx >= 0) items.value[idx] = updated;
    else items.value.unshift(updated);
    if (wasUnread) unreadCount.value = Math.max(0, unreadCount.value - 1);
  }

  async function markAllRead() {
    await api('/notifications/read-all', { method: 'PATCH' });
    const now = new Date().toISOString();
    items.value = items.value.map((n) => ({
      ...n,
      readAt: n.readAt ?? now,
    }));
    unreadCount.value = 0;
  }

  function prepend(notification: AppNotification) {
    if (items.value.some((n) => n.id === notification.id)) return;
    items.value.unshift(notification);
    if (!notification.readAt) unreadCount.value += 1;
    ElNotification({
      title: notification.title,
      message: notification.body,
      type: notification.type === 'event_cancelled' ? 'warning' : 'info',
      duration: 4500,
    });
  }

  function bindRealtime() {
    if (bound) return;
    bound = true;
    setRealtimeHandlers({
      onNotificationNew: (payload) => {
        prepend(payload as AppNotification);
      },
    });
  }

  function reset() {
    items.value = [];
    unreadCount.value = 0;
    bound = false;
  }

  return {
    items,
    unread,
    unreadCount,
    loading,
    load,
    markRead,
    markAllRead,
    prepend,
    bindRealtime,
    reset,
  };
});
