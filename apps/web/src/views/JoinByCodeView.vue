<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);

const form = reactive({
  code: '',
});

const rules: FormRules = {
  code: [
    { required: true, message: 'Введите код', trigger: 'blur' },
    { min: 4, message: 'Слишком короткий код', trigger: 'blur' },
  ],
};

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  loading.value = true;
  try {
    await api('/invitations/accept-by-code', {
      method: 'POST',
      json: { code: form.code.trim().toUpperCase() },
    });
    await auth.fetchMe();
    ElMessage.success('Вы присоединились к семье');
    await router.replace('/');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Неверный код');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card" shadow="never">
      <div class="brand">Семейный календарь</div>
      <h1>Код приглашения</h1>
      <p class="lead">Введите код, который вам прислали</p>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        require-asterisk-position="right"
        @submit.prevent="submit"
      >
        <el-form-item label="Код" prop="code">
          <el-input
            v-model="form.code"
            maxlength="8"
            clearable
            style="text-transform: uppercase; letter-spacing: 0.12em"
          />
        </el-form-item>
        <div class="auth-actions">
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Присоединиться
          </el-button>
          <el-button size="large" :disabled="loading" @click="router.push('/')">
            Отмена
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>
