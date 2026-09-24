<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const login = ref('');
const password = ref('');
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    await auth.login(login.value, password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    if (redirect.startsWith('/') && !redirect.startsWith('//')) {
      await router.replace(redirect);
      return;
    }
    const families = auth.user?.families ?? [];
    await router.replace(families.length ? '/' : '/setup');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Ошибка входа');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never">
      <div class="brand">Семейный календарь</div>
      <h1>Вход</h1>
      <p class="lead">Общий календарь семьи с проверкой пересечений</p>

      <el-form label-position="top" size="large" @submit.prevent="submit">
        <el-form-item label="Логин">
          <el-input v-model="login" autocomplete="username" placeholder="Логин или email" />
        </el-form-item>
        <el-form-item label="Пароль">
          <el-input
            v-model="password"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <p class="auth-forgot">
          <a href="#" @click.prevent="router.push('/forgot-password')">Забыли пароль?</a>
        </p>
        <el-space wrap :size="12" style="margin-top: 0.25rem">
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Войти
          </el-button>
          <el-button size="large" @click="router.push({ name: 'register', query: route.query })">
            Регистрация
          </el-button>
        </el-space>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.auth-forgot {
  margin: -0.35rem 0 0.85rem;
  font-size: 0.9rem;
}
.auth-forgot a {
  color: var(--accent);
  text-decoration: none;
}
.auth-forgot a:hover {
  text-decoration: underline;
}
</style>
