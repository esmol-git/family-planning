<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const password = ref('');
const password2 = ref('');
const loading = ref(false);

const token = computed(() => {
  const q = route.query.token;
  return typeof q === 'string' ? q : '';
});

async function submit() {
  if (!token.value) {
    ElMessage.error('В ссылке нет токена сброса');
    return;
  }
  if (password.value.length < 6) {
    ElMessage.warning('Пароль не короче 6 символов');
    return;
  }
  if (password.value !== password2.value) {
    ElMessage.warning('Пароли не совпадают');
    return;
  }
  loading.value = true;
  try {
    const res = await auth.resetPassword(token.value, password.value);
    ElMessage.success(res.message || 'Пароль обновлён');
    await router.replace('/login');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось сменить пароль');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never">
      <div class="brand">Семейный календарь</div>
      <h1>Новый пароль</h1>
      <p class="lead">Придумайте пароль для входа в аккаунт</p>

      <el-alert
        v-if="!token"
        type="error"
        :closable="false"
        show-icon
        title="Ссылка неполная — запросите сброс пароля снова"
        style="margin-bottom: 1rem"
      />

      <el-form label-position="top" size="large" @submit.prevent="submit">
        <el-form-item label="Новый пароль">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="new-password"
            minlength="6"
          />
        </el-form-item>
        <el-form-item label="Ещё раз">
          <el-input
            v-model="password2"
            type="password"
            show-password
            autocomplete="new-password"
            minlength="6"
          />
        </el-form-item>
        <el-space wrap :size="12">
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            :disabled="!token"
            size="large"
          >
            Сохранить
          </el-button>
          <el-button size="large" @click="router.push('/login')">Отмена</el-button>
        </el-space>
      </el-form>
    </el-card>
  </div>
</template>
