<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  login: '',
  password: '',
});

const rules: FormRules = {
  login: [{ required: true, message: 'Укажите логин или email', trigger: 'blur' }],
  password: [
    { required: true, message: 'Укажите пароль', trigger: 'blur' },
    { min: 6, message: 'Не короче 6 символов', trigger: 'blur' },
  ],
};

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  loading.value = true;
  try {
    await auth.login(form.login.trim(), form.password);
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

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        require-asterisk-position="right"
        @submit.prevent="submit"
      >
        <el-form-item label="Логин" prop="login">
          <el-input
            v-model="form.login"
            autocomplete="username"
            clearable
          />
        </el-form-item>
        <el-form-item label="Пароль" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>

        <p class="auth-forgot">
          <a href="#" @click.prevent="router.push('/forgot-password')">Забыли пароль?</a>
        </p>

        <div class="auth-actions">
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Войти
          </el-button>
          <el-button
            size="large"
            :disabled="loading"
            @click="router.push({ name: 'register', query: route.query })"
          >
            Регистрация
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>
