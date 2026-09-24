<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';

const auth = useAuthStore();
const router = useRouter();
const formRef = ref<FormInstance>();
const loading = ref(false);
const sent = ref(false);
const message = ref('');
const devResetUrl = ref('');

const form = reactive({
  email: '',
});

const rules: FormRules = {
  email: [
    { required: true, message: 'Укажите email', trigger: 'blur' },
    { type: 'email', message: 'Некорректный email', trigger: 'blur' },
  ],
};

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  loading.value = true;
  try {
    const res = await auth.forgotPassword(form.email.trim());
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
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          require-asterisk-position="right"
          @submit.prevent="submit"
        >
          <el-form-item label="Email" prop="email">
            <el-input
              v-model="form.email"
              type="email"
              autocomplete="email"
              clearable
            />
          </el-form-item>

          <div class="auth-actions">
            <el-button type="primary" native-type="submit" :loading="loading" size="large">
              Отправить ссылку
            </el-button>
            <el-button size="large" :disabled="loading" @click="router.push('/login')">
              Назад
            </el-button>
          </div>
        </el-form>
      </template>
      <template v-else>
        <p class="muted" style="margin-bottom: 1.25rem">{{ message }}</p>
        <el-alert
          v-if="devResetUrl"
          type="info"
          :closable="false"
          show-icon
          title="Режим разработки"
          style="margin-bottom: 1.25rem"
        >
          <a :href="devResetUrl">Открыть ссылку сброса</a>
        </el-alert>
        <div class="auth-actions">
          <el-button type="primary" size="large" @click="router.push('/login')">
            Ко входу
          </el-button>
        </div>
      </template>
    </el-card>
  </div>
</template>
