<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const token = computed(() => String(route.params.token ?? ''));
const loading = ref(true);
const accepting = ref(false);
const preview = ref<{
  family: { id: string; name: string };
  memberType: string;
  invitedName: string | null;
  expiresAt: string;
} | null>(null);
const error = ref('');

const roleLabel: Record<string, string> = {
  adult: 'Взрослый',
  helper: 'Помощник',
};

async function load() {
  loading.value = true;
  error.value = '';
  try {
    preview.value = await api(`/invitations/${token.value}`, { auth: false });
  } catch (e) {
    preview.value = null;
    error.value = e instanceof ApiError ? e.message : 'Приглашение недоступно';
  } finally {
    loading.value = false;
  }
}

async function accept() {
  if (!auth.isAuthenticated) {
    await router.push({
      name: 'login',
      query: { redirect: route.fullPath },
    });
    return;
  }
  accepting.value = true;
  try {
    await api(`/invitations/${token.value}/accept`, { method: 'POST' });
    await auth.fetchMe();
    ElMessage.success('Вы присоединились к семье');
    await router.replace('/');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось принять');
  } finally {
    accepting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never" v-loading="loading">
      <div class="brand">Семейный календарь</div>
      <h1>Приглашение</h1>

      <el-alert
        v-if="error"
        type="error"
        :closable="false"
        :title="error"
        show-icon
        style="margin-top: 0.5rem"
      />

      <template v-else-if="preview">
        <p class="lead" style="margin-bottom: 0.75rem">
          Вас приглашают в семью
          <strong>{{ preview.family.name }}</strong>
        </p>
        <p class="muted" style="margin: 0 0 0.35rem">
          Роль: {{ roleLabel[preview.memberType] ?? preview.memberType }}
          <span v-if="preview.invitedName"> · имя: {{ preview.invitedName }}</span>
        </p>
        <p class="muted" style="font-size: 0.85rem; margin: 0 0 1.5rem">
          Действует до {{ new Date(preview.expiresAt).toLocaleString('ru-RU') }}
        </p>

        <el-space wrap :size="12">
          <el-button type="primary" size="large" :loading="accepting" @click="accept">
            {{ auth.isAuthenticated ? 'Присоединиться' : 'Войти и присоединиться' }}
          </el-button>
          <el-button
            v-if="!auth.isAuthenticated"
            size="large"
            @click="
              router.push({
                name: 'register',
                query: { redirect: route.fullPath },
              })
            "
          >
            Регистрация
          </el-button>
          <el-button v-else size="large" @click="router.push('/')">Отмена</el-button>
        </el-space>
      </template>
    </el-card>
  </div>
</template>
