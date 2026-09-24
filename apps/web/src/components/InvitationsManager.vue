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

const store = useFamilyStore();
const loading = ref(false);
const invitations = ref<Invitation[]>([]);
const form = reactive({
  memberType: 'adult' as 'adult' | 'helper',
  invitedName: '',
  targetMemberId: '' as string,
  color: '#0D9488',
  expiresInDays: 7,
});

const unboundMembers = computed(() =>
  (store.family?.members ?? []).filter(
    (m) => !m.userId && m.type !== 'owner' && m.type !== 'child' && m.active !== false,
  ),
);

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

function onTargetChange(id: string) {
  form.targetMemberId = id;
  if (!id) return;
  const m = store.family?.members.find((x) => x.id === id);
  if (m) {
    form.invitedName = m.name;
    form.color = m.color;
    form.memberType = m.type === 'helper' ? 'helper' : 'adult';
  }
}

async function create() {
  if (!store.family) return;
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
    ElMessage.success('Приглашение создано');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось создать');
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
    <p class="muted" style="font-size: 0.85rem; margin-top: 0">
      Выберите существующего участника (например Екатерину) — она получит вход без дубля в списке.
      Или оставьте пустым, чтобы создать нового.
    </p>

    <el-form label-position="top" size="large" @submit.prevent="create">
      <el-form-item label="Участник без входа">
        <el-select
          :model-value="form.targetMemberId"
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
      <el-form-item v-if="!form.targetMemberId" label="Роль">
        <el-select v-model="form.memberType" style="width: 100%">
          <el-option label="Взрослый" value="adult" />
          <el-option label="Помощник" value="helper" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="!form.targetMemberId" label="Имя (необязательно)">
        <el-input v-model="form.invitedName" placeholder="Как отображать в календаре" />
      </el-form-item>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item v-if="!form.targetMemberId" label="Цвет">
            <el-color-picker
              v-model="form.color"
              size="large"
              color-format="hex"
              :clearable="false"
              :predefine="PREDEFINE_COLORS"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="Срок (дней)">
            <el-input-number
              v-model="form.expiresInDays"
              :min="1"
              :max="30"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-button type="primary" native-type="submit">Создать приглашение</el-button>
    </el-form>

    <el-divider />

    <el-table v-loading="loading" :data="invitations" size="default" empty-text="Пока нет приглашений">
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
          <span v-if="row.targetMemberId" class="muted"> (существующий)</span>
        </template>
      </el-table-column>
      <el-table-column label="Ссылка" min-width="160">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            link
            type="primary"
            @click="copy(`${inviteBase}${row.invitePath}`, 'Ссылка')"
          >
            Копировать ссылку
          </el-button>
          <span v-else class="muted">{{ row.status }}</span>
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
