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
  status?: string;
  usable?: boolean;
} | null>(null);
const error = ref('');

const roleLabel: Record<string, string> = {
  adult: 'Взрослый',
  helper: 'Помощник',
};

const statusHint: Record<string, string> = {
  accepted: 'Это приглашение уже принято — повторно по ссылке входить не нужно.',
  revoked: 'Приглашение отозвано. Попросите новую ссылку у организатора.',
  expired: 'Срок приглашения истёк. Попросите новую ссылку у организатора.',
};

const inviteRedirect = computed(() => route.fullPath);
const usable = computed(() => preview.value?.usable === true);
const usedStatus = computed(() => preview.value?.status ?? '');

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
      name: 'register',
      query: { redirect: inviteRedirect.value },
    });
    return;
  }
  accepting.value = true;
  try {
    await api(`/invitations/${token.value}/accept`, { method: 'POST' });
    await auth.fetchMe();
    ElMessage.success(`Вы в семье «${preview.value?.family.name ?? ''}»`);
    await router.replace('/');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось принять');
  } finally {
    accepting.value = false;
  }
}

function goLogin() {
  void router.push({ name: 'login' });
}

function goHome() {
  void router.replace('/');
}

onMounted(async () => {
  if (!auth.user && localStorage.getItem('fc_token')) {
    try {
      await auth.fetchMe();
    } catch {
      /* ignore */
    }
  }

  await load();
  if (!preview.value || error.value) return;

  // Уже в этой семье — сразу в календарь
  if (
    auth.isAuthenticated &&
    auth.user?.families?.some((f) => f.id === preview.value!.family.id)
  ) {
    await router.replace('/');
    return;
  }

  // Активное приглашение + уже вошли — принимаем
  if (auth.isAuthenticated && usable.value) {
    await accept();
  }
});
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never" v-loading="loading || accepting">
      <div class="brand">Семейный календарь</div>
      <h1>Приглашение в семью</h1>

      <el-alert
        v-if="error"
        type="error"
        :closable="false"
        :title="error"
        show-icon
        style="margin-top: 0.5rem; margin-bottom: 1.25rem"
      />

      <!-- Ссылка уже не для первого входа -->
      <template v-else-if="preview && !usable">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          :title="statusHint[usedStatus] || 'Приглашение недоступно'"
          style="margin-top: 0.5rem; margin-bottom: 1.25rem"
        />
        <p class="lead" style="margin-bottom: 0.75rem">
          Дальше заходите так же, как на любой сайт:
        </p>
        <ol class="invite-steps">
          <li>Откройте адрес календаря (сохраните в закладки)</li>
          <li>Нажмите «Войти»</li>
          <li>Введите свой <strong>логин и пароль</strong>, которые придумали при регистрации</li>
        </ol>
        <p class="muted" style="margin: 0 0 1.25rem; font-size: 0.9rem">
          Ссылка-приглашение нужна только один раз — чтобы создать аккаунт и попасть в семью
          «{{ preview.family.name }}».
        </p>
        <div class="auth-actions">
          <el-button
            v-if="auth.isAuthenticated"
            type="primary"
            size="large"
            @click="goHome"
          >
            Открыть календарь
          </el-button>
          <el-button v-else type="primary" size="large" @click="goLogin">
            Войти в календарь
          </el-button>
        </div>
      </template>

      <template v-else-if="preview">
        <p class="lead" style="margin-bottom: 0.75rem">
          Вас приглашают в
          <strong>{{ preview.family.name }}</strong>
          — это не создание новой семьи.
        </p>
        <p class="muted" style="margin: 0 0 0.35rem">
          Роль: {{ roleLabel[preview.memberType] ?? preview.memberType }}
          <span v-if="preview.invitedName"> · профиль: {{ preview.invitedName }}</span>
        </p>
        <p class="muted" style="font-size: 0.85rem; margin: 0 0 1.25rem">
          Действует до {{ new Date(preview.expiresAt).toLocaleString('ru-RU') }}
        </p>

        <template v-if="!auth.isAuthenticated">
          <p class="muted" style="margin: 0 0 1rem; font-size: 0.9rem">
            Один раз придумайте логин и пароль — потом будете входить ими на главной странице,
            без этой ссылки.
          </p>
          <div class="auth-actions">
            <el-button type="primary" size="large" @click="accept">
              Создать логин и присоединиться
            </el-button>
            <el-button
              size="large"
              @click="
                router.push({
                  name: 'login',
                  query: { redirect: inviteRedirect },
                })
              "
            >
              Уже есть аккаунт
            </el-button>
          </div>
        </template>
        <template v-else>
          <el-button type="primary" size="large" :loading="accepting" @click="accept">
            Присоединиться к «{{ preview.family.name }}»
          </el-button>
        </template>
      </template>

      <div v-if="error" class="auth-actions" style="margin-top: 1.25rem">
        <el-button type="primary" size="large" @click="goLogin">Войти</el-button>
        <el-button size="large" @click="router.push({ name: 'register' })">
          Регистрация
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.invite-steps {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  color: var(--ink);
  line-height: 1.55;
  font-size: 0.95rem;
}

.invite-steps li {
  margin-bottom: 0.35rem;
}
</style>
