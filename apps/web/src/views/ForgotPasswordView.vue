<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const auth = useAuthStore();
const router = useRouter();
const email = ref('');
const loading = ref(false);
const sent = ref(false);
const message = ref('');
const devResetUrl = ref('');

async function submit() {
  if (!email.value.trim()) {
    ElMessage.warning('Укажите email');
    return;
  }
  loading.value = true;
  try {
    const res = await auth.forgotPassword(email.value.trim());
    message.value = res.message;
    devResetUrl.value = res.devResetUrl || '';
    sent.value = true;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось отправить');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never">
      <div class="brand">Семейный календарь</div>
      <h1>Сброс пароля</h1>
      <p class="lead">
        {{
          sent
            ? 'Проверьте почту — если аккаунт есть, ссылка уже отправлена'
            : 'Укажите email аккаунта, мы пришлём ссылку для нового пароля'
        }}
      </p>

      <template v-if="!sent">
        <el-form label-position="top" size="large" @submit.prevent="submit">
          <el-form-item label="Email">
            <el-input v-model="email" type="email" autocomplete="username" />
          </el-form-item>
          <el-space wrap :size="12">
            <el-button type="primary" native-type="submit" :loading="loading" size="large">
              Отправить ссылку
            </el-button>
            <el-button size="large" @click="router.push('/login')">Назад</el-button>
          </el-space>
        </el-form>
      </template>
      <template v-else>
        <p class="muted" style="margin-bottom: 1rem">{{ message }}</p>
        <el-alert
          v-if="devResetUrl"
          type="info"
          :closable="false"
          show-icon
          title="Режим разработки"
          style="margin-bottom: 1rem"
        >
          <a :href="devResetUrl">Открыть ссылку сброса</a>
        </el-alert>
        <el-button type="primary" size="large" @click="router.push('/login')">Ко входу</el-button>
      </template>
    </el-card>
  </div>
</template>
