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
  password: '',
  password2: '',
});

const token = computed(() => {
  const q = route.query.token;
  return typeof q === 'string' ? q : '';
});

const rules: FormRules = {
  password: [
    { required: true, message: 'Укажите пароль', trigger: 'blur' },
    { min: 6, message: 'Не короче 6 символов', trigger: 'blur' },
  ],
  password2: [
    { required: true, message: 'Повторите пароль', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.password) {
          callback(new Error('Пароли не совпадают'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

async function submit() {
  if (!token.value) {
    ElMessage.error('В ссылке нет токена сброса');
    return;
  }
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  loading.value = true;
  try {
    const res = await auth.resetPassword(token.value, form.password);
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
        style="margin-bottom: 1.25rem"
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        require-asterisk-position="right"
        @submit.prevent="submit"
      >
        <el-form-item label="Новый пароль" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="Ещё раз" prop="password2">
          <el-input
            v-model="form.password2"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>

        <div class="auth-actions">
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            :disabled="!token"
            size="large"
          >
            Сохранить
          </el-button>
          <el-button size="large" :disabled="loading" @click="router.push('/login')">
            Отмена
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>
