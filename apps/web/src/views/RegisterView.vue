<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const name = ref('');
const login = ref('');
const email = ref('');
const password = ref('');
const loading = ref(false);

async function submit() {
  if (!login.value.trim() || login.value.trim().length < 3) {
    ElMessage.warning('Логин не короче 3 символов');
    return;
  }
  loading.value = true;
  try {
    await auth.register(name.value, login.value.trim(), password.value, email.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    if (redirect.startsWith('/') && !redirect.startsWith('//')) {
      await router.replace(redirect);
      return;
    }
    await router.replace('/setup');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Ошибка регистрации');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never">
      <div class="brand">Семейный календарь</div>
      <h1>Регистрация</h1>
      <p class="lead">
        {{
          typeof route.query.redirect === 'string' && route.query.redirect.includes('/invite/')
            ? 'Придумайте логин и пароль — потом попадёте в семью по приглашению'
            : 'Логин и пароль — этого достаточно для входа'
        }}
      </p>

      <el-form label-position="top" size="large" @submit.prevent="submit">
        <el-form-item label="Имя">
          <el-input v-model="name" placeholder="Как вас зовут" />
        </el-form-item>
        <el-form-item label="Логин" required>
          <el-input
            v-model="login"
            autocomplete="username"
            placeholder="Только латиница, например katya"
          />
        </el-form-item>
        <el-form-item label="Email (необязательно)">
          <el-input v-model="email" type="email" placeholder="Если понадобится сброс пароля" />
        </el-form-item>
        <el-form-item label="Пароль" required>
          <el-input v-model="password" type="password" show-password minlength="6" />
        </el-form-item>
        <el-space wrap :size="12" style="margin-top: 0.25rem">
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Создать аккаунт
          </el-button>
          <el-button size="large" @click="router.push({ name: 'login', query: route.query })">
            Уже есть аккаунт
          </el-button>
        </el-space>
      </el-form>
    </el-card>
  </div>
</template>
