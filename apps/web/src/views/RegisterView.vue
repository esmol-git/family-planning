<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
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
  name: '',
  login: '',
  email: '',
  password: '',
});

const fromInvite = computed(
  () =>
    typeof route.query.redirect === 'string' && route.query.redirect.includes('/invite/'),
);

const rules: FormRules = {
  name: [{ required: true, message: 'Укажите имя', trigger: 'blur' }],
  login: [
    { required: true, message: 'Укажите логин', trigger: 'blur' },
    { min: 3, message: 'Не короче 3 символов', trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9._-]+$/,
      message: 'Только латиница, цифры, точка, _ или -',
      trigger: 'blur',
    },
  ],
  email: [
    {
      validator: (_rule, value, callback) => {
        const v = typeof value === 'string' ? value.trim() : '';
        if (!v) {
          callback();
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
          callback(new Error('Некорректный email'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: 'Придумайте пароль', trigger: 'blur' },
    { min: 6, message: 'Не короче 6 символов', trigger: 'blur' },
  ],
};

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  loading.value = true;
  try {
    await auth.register(
      form.name.trim(),
      form.login.trim(),
      form.password,
      form.email.trim() || undefined,
    );
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
          fromInvite
            ? 'Придумайте логин и пароль — потом попадёте в семью по приглашению'
            : 'Логин и пароль — этого достаточно для входа'
        }}
      </p>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        require-asterisk-position="right"
        @submit.prevent="submit"
      >
        <el-form-item label="Имя" prop="name">
          <el-input v-model="form.name" autocomplete="name" clearable />
        </el-form-item>
        <el-form-item label="Логин" prop="login" required>
          <el-input
            v-model="form.login"
            autocomplete="username"
            clearable
          />
        </el-form-item>
        <el-form-item label="Email — необязательно" prop="email">
          <el-input
            v-model="form.email"
            type="email"
            autocomplete="email"
            clearable
          />
        </el-form-item>
        <el-form-item label="Пароль" prop="password" required>
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>

        <div class="auth-actions">
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Создать аккаунт
          </el-button>
          <el-button
            size="large"
            :disabled="loading"
            @click="router.push({ name: 'login', query: route.query })"
          >
            Уже есть аккаунт
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>
