<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Bell } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useNotificationsStore } from '../stores/notifications';
import {
  disablePush,
  enablePush,
  getPushPermission,
  isPushSubscribed,
  pushSupported,
} from '../api/push';

const store = useNotificationsStore();
const pushState = ref<'unsupported' | 'off' | 'on' | 'denied'>('unsupported');
const pushBusy = ref(false);

onMounted(async () => {
  void store.load();
  if (!pushSupported()) {
    pushState.value = 'unsupported';
    return;
  }
  const perm = await getPushPermission();
  if (perm === 'denied') {
    pushState.value = 'denied';
    return;
  }
  pushState.value = (await isPushSubscribed()) ? 'on' : 'off';
});

async function openItem(id: string, readAt: string | null) {
  if (!readAt) await store.markRead(id);
}

async function togglePush() {
  pushBusy.value = true;
  try {
    if (pushState.value === 'on') {
      await disablePush();
      pushState.value = 'off';
      ElMessage.success('Браузерные уведомления выключены');
    } else {
      const result = await enablePush();
      if (result === 'granted') {
        pushState.value = 'on';
        ElMessage.success('Браузерные уведомления включены');
      } else if (result === 'denied') {
        pushState.value = 'denied';
        ElMessage.warning('Разрешение отклонено в настройках браузера');
      }
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : 'Не удалось настроить push');
  } finally {
    pushBusy.value = false;
  }
}
</script>

<template>
  <el-popover placement="bottom-end" :width="360" trigger="click">
    <template #reference>
      <el-badge :value="store.unreadCount || undefined" :hidden="!store.unreadCount" :max="99">
        <el-button :icon="Bell" circle title="Уведомления" />
      </el-badge>
    </template>

    <div class="notif-panel">
      <div class="notif-head">
        <strong>Уведомления</strong>
        <el-button
          v-if="store.unreadCount"
          link
          type="primary"
          size="small"
          @click="store.markAllRead()"
        >
          Прочитать все
        </el-button>
      </div>

      <div v-if="pushState !== 'unsupported'" class="push-row">
        <span class="muted">Браузерные push</span>
        <el-button
          v-if="pushState !== 'denied'"
          link
          type="primary"
          size="small"
          :loading="pushBusy"
          @click="togglePush"
        >
          {{ pushState === 'on' ? 'Выключить' : 'Включить' }}
        </el-button>
        <span v-else class="muted" style="font-size: 0.8rem">Запрещены в браузере</span>
      </div>

      <el-empty
        v-if="!store.items.length"
        description="Пока пусто"
        :image-size="48"
      />

      <ul v-else class="notif-list">
        <li
          v-for="n in store.items"
          :key="n.id"
          :class="{ unread: !n.readAt }"
          @click="openItem(n.id, n.readAt)"
        >
          <div class="notif-title">{{ n.title }}</div>
          <div class="notif-body">{{ n.body }}</div>
          <div class="notif-meta">
            {{ new Date(n.createdAt).toLocaleString('ru-RU') }}
          </div>
        </li>
      </ul>
    </div>
  </el-popover>
</template>

<style scoped>
.notif-panel {
  max-height: 420px;
  overflow: auto;
}
.notif-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.push-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.notif-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.notif-list li {
  padding: 12px 10px;
  border-radius: 12px;
  cursor: pointer;
}
.notif-list li:hover {
  background: var(--el-fill-color-light);
}
.notif-list li.unread {
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}
.notif-title {
  font-weight: 600;
  font-size: 0.9rem;
}
.notif-body {
  font-size: 0.85rem;
  color: var(--el-text-color-regular);
  margin-top: 2px;
}
.notif-meta {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
