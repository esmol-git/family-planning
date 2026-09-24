<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, ApiError } from '../api/client';
import { useFamilyStore } from '../stores/family';
import { PREDEFINE_COLORS } from '../constants/colors';

type Invitation = {
  id: string;
  token: string;
  code: string;
  memberType: string;
  invitedName: string | null;
  targetMemberId: string | null;
  status: string;
  expiresAt: string;
  invitePath: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'ожидает',
  accepted: 'принято',
  revoked: 'отозвано',
  expired: 'истекло',
};

const store = useFamilyStore();
const loading = ref(false);
const creating = ref(false);
const invitations = ref<Invitation[]>([]);
const form = reactive({
  memberType: 'adult' as 'adult' | 'helper',
  invitedName: '',
  targetMemberId: '' as string,
  color: '#0D9488',
  expiresInDays: 7,
});

/** Взрослые / помощники без привязанного аккаунта */
const unboundMembers = computed(() =>
  (store.family?.members ?? []).filter(
    (m) =>
      !m.userId &&
      m.active !== false &&
      (m.type === 'adult' || m.type === 'helper'),
  ),
);

const hasUnbound = computed(() => unboundMembers.value.length > 0);

const inviteBase = typeof window !== 'undefined' ? window.location.origin : '';

async function load() {
  if (!store.family) return;
  loading.value = true;
  try {
    invitations.value = await api<Invitation[]>(
      `/families/${store.family.id}/invitations`,
    );
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось загрузить');
  } finally {
    loading.value = false;
  }
}

function onTargetChange(id: string | null | undefined) {
  form.targetMemberId = id ?? '';
  if (!id) {
    form.invitedName = '';
    return;
  }
  const m = store.family?.members.find((x) => x.id === id);
  if (m) {
    form.invitedName = m.name;
    form.color = m.color;
    form.memberType = m.type === 'helper' ? 'helper' : 'adult';
  }
}

async function create() {
  if (!store.family) return;
  creating.value = true;
  try {
    const created = await api<Invitation>(
      `/families/${store.family.id}/invitations`,
      {
        method: 'POST',
        json: {
          memberType: form.memberType,
          invitedName: form.targetMemberId ? undefined : form.invitedName || undefined,
          targetMemberId: form.targetMemberId || undefined,
          color: form.color,
          expiresInDays: form.expiresInDays,
        },
      },
    );
    invitations.value.unshift(created);
    form.invitedName = '';
    form.targetMemberId = '';
    ElMessage.success('Приглашение создано — скопируйте ссылку ниже');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось создать');
  } finally {
    creating.value = false;
  }
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(`${label} скопирован`);
  } catch {
    ElMessage.warning('Не удалось скопировать');
  }
}

async function revoke(inv: Invitation) {
  if (!store.family) return;
  try {
    await ElMessageBox.confirm('Отозвать приглашение?', 'Подтверждение', {
      type: 'warning',
    });
    await api(`/families/${store.family.id}/invitations/${inv.id}`, {
      method: 'DELETE',
    });
    inv.status = 'revoked';
    ElMessage.success('Отозвано');
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message);
  }
}

onMounted(load);

defineExpose({ load });
</script>

<template>
  <div class="invites-manager">
    <el-alert
      v-if="!hasUnbound"
      type="success"
      :closable="false"
      show-icon
      title="Все взрослые уже с аккаунтом"
      description="Екатерина и другие привязаны. Ниже можно пригласить нового человека — появится отдельный участник в календаре."
      style="margin-bottom: 1.25rem"
    />
    <p v-else class="invites-lead">
      Выберите участника без входа — аккаунт привяжется к нему без дубля. Или оставьте
      пустым и создайте нового.
    </p>

    <el-form
      label-position="top"
      size="large"
      class="invites-form"
      @submit.prevent="create"
    >
      <el-form-item v-if="hasUnbound" label="Участник без входа">
        <el-select
          :model-value="form.targetMemberId || undefined"
          clearable
          placeholder="Не выбран — создать нового"
          style="width: 100%"
          @update:model-value="onTargetChange"
        >
          <el-option
            v-for="m in unboundMembers"
            :key="m.id"
            :label="m.name"
            :value="m.id"
          />
        </el-select>
      </el-form-item>

      <template v-if="!form.targetMemberId">
        <el-form-item label="Роль">
          <el-select v-model="form.memberType" style="width: 100%">
            <el-option label="Взрослый" value="adult" />
            <el-option label="Помощник (только просмотр)" value="helper" />
          </el-select>
        </el-form-item>
        <el-form-item label="Имя">
          <el-input v-model="form.invitedName" clearable />
        </el-form-item>
        <div class="invites-form__row">
          <el-form-item label="Цвет">
            <el-color-picker
              v-model="form.color"
              size="large"
              color-format="hex"
              :clearable="false"
              :predefine="PREDEFINE_COLORS"
            />
          </el-form-item>
          <el-form-item label="Срок (дней)" class="invites-form__days">
            <el-input-number
              v-model="form.expiresInDays"
              :min="1"
              :max="30"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
        </div>
      </template>
      <el-form-item v-else label="Срок (дней)">
        <el-input-number
          v-model="form.expiresInDays"
          :min="1"
          :max="30"
          controls-position="right"
          style="width: 100%; max-width: 160px"
        />
      </el-form-item>

      <div class="auth-actions" style="margin-top: 0.25rem">
        <el-button type="primary" native-type="submit" size="large" :loading="creating">
          Создать приглашение
        </el-button>
      </div>
    </el-form>

    <el-divider />

    <el-table
      v-loading="loading"
      :data="invitations"
      size="default"
      empty-text="Пока нет приглашений"
    >
      <el-table-column label="Код" width="110">
        <template #default="{ row }">
          <el-button link type="primary" @click="copy(row.code, 'Код')">
            {{ row.code }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="Для" min-width="120">
        <template #default="{ row }">
          {{ row.invitedName || '—' }}
          <span v-if="row.targetMemberId" class="muted"> · в списке</span>
        </template>
      </el-table-column>
      <el-table-column label="Статус" width="100">
        <template #default="{ row }">
          <span class="muted">{{ STATUS_LABEL[row.status] ?? row.status }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Ссылка" min-width="160">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            @click="copy(`${inviteBase}${row.invitePath}`, 'Ссылка')"
          >
            Копировать
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="" width="100" align="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            link
            type="danger"
            @click="revoke(row)"
          >
            Отозвать
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.invites-lead {
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  color: var(--muted);
  line-height: 1.45;
}

.invites-form :deep(.el-form-item) {
  margin-bottom: 1.15rem;
}

.invites-form__row {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
}

.invites-form__days {
  flex: 1;
  min-width: 0;
}
</style>
