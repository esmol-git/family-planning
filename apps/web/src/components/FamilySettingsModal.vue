<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, EditPen, Plus } from '@element-plus/icons-vue';
import { useFamilyStore, type Member } from '../stores/family';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';
import { PREDEFINE_COLORS } from '../constants/colors';
import {
  MEMBER_RELATION_LABELS,
  MEMBER_RELATION_OPTIONS,
  MemberRelation,
} from '@family-calendar/shared-types';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  openCategories: [];
  openInvites: [];
}>();

const store = useFamilyStore();
const auth = useAuthStore();
const savingFamily = ref(false);
const memberDialog = ref(false);
const editingMember = ref<Member | null>(null);
const savingMember = ref(false);

const familyForm = reactive({
  name: '',
  timezone: 'Europe/Moscow',
  travelBufferDefault: 15,
});

const memberForm = reactive({
  name: '',
  color: '#d95540',
  type: 'child' as string,
  relation: MemberRelation.SON as string,
});

const TIMEZONES = [
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
];

const TYPE_LABELS: Record<string, string> = {
  owner: 'Организатор',
  adult: 'Взрослый',
  child: 'Ребёнок',
  helper: 'Помощник',
};

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
});

const members = computed(() => store.family?.members ?? []);

watch(
  () => props.modelValue,
  (open) => {
    if (!open || !store.family) return;
    familyForm.name = store.family.name;
    familyForm.timezone = store.family.timezone;
    familyForm.travelBufferDefault = store.family.travelBufferDefault;
  },
);

async function saveFamily() {
  if (!familyForm.name.trim()) {
    ElMessage.warning('Укажите название семьи');
    return;
  }
  savingFamily.value = true;
  try {
    await store.updateFamily({
      name: familyForm.name.trim(),
      timezone: familyForm.timezone,
      travelBufferDefault: familyForm.travelBufferDefault,
    });
    ElMessage.success('Настройки семьи сохранены');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось сохранить');
  } finally {
    savingFamily.value = false;
  }
}

function relationLabel(relation?: string) {
  if (!relation) return '';
  return MEMBER_RELATION_LABELS[relation as MemberRelation] ?? relation;
}

function openCreateMember() {
  editingMember.value = null;
  memberForm.name = '';
  memberForm.color = '#d95540';
  memberForm.type = 'child';
  memberForm.relation = MemberRelation.SON;
  memberDialog.value = true;
}

function openEditMember(member: Member) {
  editingMember.value = member;
  memberForm.name = member.name;
  memberForm.color = member.color;
  memberForm.type = member.type === 'owner' ? 'owner' : member.type;
  memberForm.relation = member.relation || MemberRelation.OTHER;
  memberDialog.value = true;
}

async function saveMember() {
  if (!memberForm.name.trim()) {
    ElMessage.warning('Укажите имя');
    return;
  }
  savingMember.value = true;
  try {
    if (editingMember.value) {
      const payload: Partial<{
        name: string;
        color: string;
        type: string;
        relation: string;
      }> = {
        name: memberForm.name.trim(),
        color: memberForm.color,
        relation: memberForm.relation,
      };
      if (editingMember.value.type !== 'owner' && memberForm.type !== 'owner') {
        payload.type = memberForm.type;
      }
      await store.updateMember(editingMember.value.id, payload);
      if (editingMember.value.type === 'owner') {
        await auth.fetchMe();
      }
      ElMessage.success('Участник обновлён');
    } else {
      await store.addMember({
        name: memberForm.name.trim(),
        color: memberForm.color,
        type: memberForm.type,
        relation: memberForm.relation,
      });
      ElMessage.success('Участник добавлен');
    }
    memberDialog.value = false;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось сохранить');
  } finally {
    savingMember.value = false;
  }
}

async function removeMember(member: Member) {
  if (member.type === 'owner') return;
  try {
    await ElMessageBox.confirm(
      `Удалить участника «${member.name}»? Он снимется с общих событий. Если он один в событии — сначала поправьте событие.`,
      'Удаление участника',
      { type: 'warning', confirmButtonText: 'Удалить' },
    );
    await store.deleteMember(member.id);
    ElMessage.success('Участник удалён');
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message);
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="Настройки семьи"
    width="640px"
    align-center
    append-to-body
    destroy-on-close
    class="airy-dialog"
  >
    <div class="family-settings">
      <section class="family-settings__section">
        <div class="family-settings__head">
          <h3>Семья</h3>
          <el-tag type="danger" effect="plain" round size="small">Организатор</el-tag>
        </div>
        <p class="family-settings__hint">
          Эти параметры видят все участники. Менять может только организатор.
        </p>

        <el-form label-position="top" size="large" @submit.prevent="saveFamily">
          <el-form-item label="Название">
            <el-input v-model="familyForm.name" maxlength="80" show-word-limit />
          </el-form-item>
          <div class="family-settings__row">
            <el-form-item label="Часовой пояс">
              <el-select v-model="familyForm.timezone" filterable style="width: 100%">
                <el-option
                  v-for="tz in TIMEZONES"
                  :key="tz.value"
                  :label="tz.label"
                  :value="tz.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="Буфер дороги, мин">
              <el-input-number
                v-model="familyForm.travelBufferDefault"
                :min="0"
                :max="180"
                :step="5"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </div>
          <el-button type="primary" :loading="savingFamily" @click="saveFamily">
            Сохранить настройки
          </el-button>
        </el-form>
      </section>

      <section class="family-settings__section">
        <div class="family-settings__head">
          <h3>Участники</h3>
          <el-button type="primary" :icon="Plus" @click="openCreateMember">Добавить</el-button>
        </div>
        <p class="family-settings__hint">Цвет участника — полоска и точки на событиях</p>

        <div class="member-list">
          <div v-for="m in members" :key="m.id" class="member-card">
            <div class="member-card__main">
              <span class="member-card__swatch" :style="{ background: m.color }" />
              <div class="member-card__text">
                <span class="member-card__name">{{ m.name }}</span>
                <span class="member-card__type">
                  {{ relationLabel(m.relation) }}
                  · {{ TYPE_LABELS[m.type] ?? m.type }}
                  <template v-if="m.login"> · логин {{ m.login }}</template>
                  <template v-else-if="m.type === 'adult' || m.type === 'helper'">
                    · без входа
                  </template>
                </span>
              </div>
            </div>
            <div class="member-card__actions">
              <el-tooltip content="Изменить" placement="top">
                <el-button circle :icon="EditPen" @click="openEditMember(m)" />
              </el-tooltip>
              <el-tooltip
                v-if="m.type !== 'owner'"
                content="Удалить"
                placement="top"
              >
                <el-button circle type="danger" plain :icon="Delete" @click="removeMember(m)" />
              </el-tooltip>
            </div>
          </div>
        </div>
      </section>

      <section class="family-settings__section family-settings__section--links">
        <div class="family-settings__head">
          <h3>Управление</h3>
        </div>
        <div class="family-settings__links">
          <el-button @click="emit('openCategories')">Категории</el-button>
          <el-button @click="emit('openInvites')">Приглашения</el-button>
        </div>
      </section>
    </div>
  </el-dialog>

  <el-dialog
    v-model="memberDialog"
    :title="editingMember ? 'Изменить участника' : 'Новый участник'"
    width="440px"
    align-center
    append-to-body
    :modal="false"
    destroy-on-close
    class="nested-dialog"
  >
    <el-form label-position="top" size="large">
      <el-form-item label="Имя">
        <el-input v-model="memberForm.name" placeholder="Имя" />
      </el-form-item>
      <el-alert
        v-if="editingMember?.type === 'owner'"
        type="info"
        :closable="false"
        show-icon
        title="Это вы в календаре — то же имя будет в шапке аккаунта"
        style="margin-bottom: 1rem"
      />
      <el-form-item label="Цвет">
        <div class="color-row">
          <el-color-picker
            v-model="memberForm.color"
            size="large"
            color-format="hex"
            :clearable="false"
            :predefine="PREDEFINE_COLORS"
          />
          <span class="color-row__preview" :style="{ background: memberForm.color }" />
        </div>
      </el-form-item>
      <el-form-item label="Кем приходится">
        <el-select v-model="memberForm.relation" style="width: 100%">
          <el-option
            v-for="opt in MEMBER_RELATION_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="editingMember?.type !== 'owner'" label="Тип доступа">
        <el-select v-model="memberForm.type" style="width: 100%">
          <el-option label="Взрослый" value="adult" />
          <el-option label="Ребёнок" value="child" />
          <el-option label="Помощник" value="helper" />
        </el-select>
      </el-form-item>
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="Организатор — полный доступ к настройкам семьи"
      />
    </el-form>
    <template #footer>
      <el-space>
        <el-button @click="memberDialog = false">Отмена</el-button>
        <el-button type="primary" :loading="savingMember" @click="saveMember">Сохранить</el-button>
      </el-space>
    </template>
  </el-dialog>
</template>

<style scoped>
.family-settings {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.family-settings__section h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
}

.family-settings__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.family-settings__hint {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.85rem;
}

.family-settings__row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 0.85rem;
}

.family-settings__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.member-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--surface-solid);
  border: 1px solid rgba(31, 28, 26, 0.06);
  box-shadow:
    0 1px 2px rgba(31, 28, 26, 0.04),
    0 8px 24px rgba(31, 28, 26, 0.05);
}

.member-card__main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.member-card__swatch {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35), 0 2px 8px rgba(31, 28, 26, 0.16);
}

.member-card__text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.member-card__name {
  font-weight: 600;
}

.member-card__type {
  font-size: 0.78rem;
  color: var(--muted);
}

.member-card__actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.color-row__preview {
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(31, 28, 26, 0.12);
}

@media (max-width: 560px) {
  .family-settings__row {
    grid-template-columns: 1fr;
  }
}
</style>
