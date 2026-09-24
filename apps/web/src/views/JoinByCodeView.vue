<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const code = ref('');
const loading = ref(false);

async function submit() {
  if (!code.value.trim()) return;
  loading.value = true;
  try {
    await api('/invitations/accept-by-code', {
      method: 'POST',
      json: { code: code.value.trim().toUpperCase() },
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
      <el-form label-position="top" size="large" @submit.prevent="submit">
        <el-form-item label="Код">
          <el-input
            v-model="code"
            maxlength="8"
            placeholder="AB12CD"
            size="large"
            style="text-transform: uppercase; letter-spacing: 0.12em"
          />
        </el-form-item>
        <el-space wrap :size="12">
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Присоединиться
          </el-button>
          <el-button size="large" @click="router.push('/')">Отмена</el-button>
        </el-space>
      </el-form>
    </el-card>
  </div>
</template>
