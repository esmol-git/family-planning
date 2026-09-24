<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useFamilyStore } from '../stores/family';
import { useAuthStore } from '../stores/auth';
import { ApiError } from '../api/client';
import { PREDEFINE_COLORS } from '../constants/colors';
import {
  MEMBER_RELATION_OPTIONS,
  MemberRelation,
} from '@family-calendar/shared-types';

const familyStore = useFamilyStore();
const auth = useAuthStore();
const router = useRouter();

const step = ref(0);
const loading = ref(false);

const familyName = ref('');
const memberForm = reactive({
  name: '',
  color: '#16A34A',
  type: 'child',
  relation: MemberRelation.SON as string,
});

const eventForm = reactive({
  title: '',
  dayOffset: 0,
  hour: 10,
  durationHours: 1,
});

const steps = [
  { title: 'Семья', hint: 'Название семейной группы' },
  { title: 'Участники', hint: 'Кого добавить в календарь' },
  { title: 'Событие', hint: 'Первое дело в расписании' },
];

const members = computed(() => familyStore.family?.members ?? []);
const categories = computed(() => familyStore.categories);

async function createFamily() {
  if (!familyName.value.trim()) {
    ElMessage.warning('Укажите название семьи');
    return;
  }
  loading.value = true;
  try {
    await familyStore.createFamily(familyName.value.trim());
    await auth.fetchMe();
    step.value = 1;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось создать семью');
  } finally {
    loading.value = false;
  }
}

async function addMember() {
  if (!memberForm.name.trim()) {
    ElMessage.warning('Укажите имя');
    return;
  }
  loading.value = true;
  try {
    await familyStore.addMember({
      name: memberForm.name.trim(),
      color: memberForm.color,
      type: memberForm.type,
      relation: memberForm.relation,
    });
    ElMessage.success('Участник добавлен');
    memberForm.name = '';
    memberForm.color = '#d95540';
    memberForm.type = 'child';
    memberForm.relation = MemberRelation.SON;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось добавить');
  } finally {
    loading.value = false;
  }
}

function startOfLocalDay(offsetDays: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

async function createFirstEvent() {
  if (!eventForm.title.trim()) {
    ElMessage.warning('Укажите название события');
    return;
  }
  const categoryId = categories.value[0]?.id;
  const participantIds = members.value.map((m) => m.id);
  if (!categoryId || !participantIds.length) {
    ElMessage.error('Нет категории или участников — вернитесь на шаг назад');
    return;
  }

  const start = startOfLocalDay(eventForm.dayOffset);
  start.setHours(eventForm.hour, 0, 0, 0);
  const end = new Date(start.getTime() + eventForm.durationHours * 60 * 60 * 1000);

  loading.value = true;
  try {
    await familyStore.saveEvent({
      title: eventForm.title.trim(),
      startsAtUtc: start.toISOString(),
      endsAtUtc: end.toISOString(),
      timezone: familyStore.family?.timezone || 'Europe/Moscow',
      categoryId,
      participantIds,
      confirmConflict: true,
    });
    ElMessage.success('Первое событие создано');
    await finish();
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось создать событие');
  } finally {
    loading.value = false;
  }
}

async function finish() {
  await router.replace({ path: '/', query: { welcome: '1' } });
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card setup-card" shadow="never">
      <div class="brand">Семейный календарь</div>

      <div class="setup-steps" aria-label="Шаги настройки">
        <div
          v-for="(s, i) in steps"
          :key="s.title"
          class="setup-steps__item"
          :class="{
            'is-active': step === i,
            'is-done': step > i,
          }"
        >
          <span class="setup-steps__num">{{ i + 1 }}</span>
          <span class="setup-steps__label">{{ s.title }}</span>
        </div>
      </div>

      <!-- Step 1: family -->
      <template v-if="step === 0">
        <h1>Создайте семью</h1>
        <p class="lead">{{ steps[0].hint }}</p>
        <el-form label-position="top" size="large" @submit.prevent="createFamily">
          <el-form-item label="Название">
            <el-input v-model="familyName" placeholder="Семья Ивановых" />
          </el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" size="large">
            Далее
          </el-button>
        </el-form>
      </template>

      <!-- Step 2: members -->
      <template v-else-if="step === 1">
        <h1>Добавьте участников</h1>
        <p class="lead">
          Организатор уже в списке. Добавьте детей и взрослых — или пропустите.
        </p>

        <ul class="setup-member-list">
          <li v-for="m in members" :key="m.id">
            <span class="setup-member-list__dot" :style="{ background: m.color }" />
            {{ m.name }}
          </li>
        </ul>

        <el-form label-position="top" size="large" @submit.prevent="addMember">
          <el-form-item label="Имя">
            <el-input v-model="memberForm.name" placeholder="Миша" />
          </el-form-item>
          <div class="setup-row">
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
            <el-form-item label="Тип">
              <el-select v-model="memberForm.type" style="width: 100%">
                <el-option label="Ребёнок" value="child" />
                <el-option label="Взрослый" value="adult" />
                <el-option label="Помощник" value="helper" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="Цвет">
            <el-color-picker
              v-model="memberForm.color"
              size="large"
              color-format="hex"
              :clearable="false"
              :predefine="PREDEFINE_COLORS"
            />
          </el-form-item>
          <el-space wrap :size="12">
            <el-button type="primary" native-type="submit" :loading="loading" size="large">
              Добавить
            </el-button>
            <el-button size="large" @click="step = 2">Далее</el-button>
          </el-space>
        </el-form>
      </template>

      <!-- Step 3: first event -->
      <template v-else>
        <h1>Первое событие</h1>
        <p class="lead">Школа, кружок или встреча — можно пропустить и создать позже.</p>

        <el-form label-position="top" size="large" @submit.prevent="createFirstEvent">
          <el-form-item label="Название">
            <el-input v-model="eventForm.title" placeholder="Футбол" />
          </el-form-item>
          <div class="setup-row">
            <el-form-item label="Когда">
              <el-select v-model="eventForm.dayOffset" style="width: 100%">
                <el-option label="Сегодня" :value="0" />
                <el-option label="Завтра" :value="1" />
                <el-option label="Послезавтра" :value="2" />
              </el-select>
            </el-form-item>
            <el-form-item label="Начало">
              <el-select v-model="eventForm.hour" style="width: 100%">
                <el-option
                  v-for="h in [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19]"
                  :key="h"
                  :label="`${String(h).padStart(2, '0')}:00`"
                  :value="h"
                />
              </el-select>
            </el-form-item>
          </div>
          <el-space wrap :size="12">
            <el-button type="primary" native-type="submit" :loading="loading" size="large">
              Создать и открыть календарь
            </el-button>
            <el-button size="large" @click="finish">Пропустить</el-button>
          </el-space>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.setup-card {
  width: min(520px, 100%);
}

.setup-steps {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.setup-steps__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  opacity: 0.45;
}

.setup-steps__item.is-active,
.setup-steps__item.is-done {
  opacity: 1;
}

.setup-steps__num {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.8rem;
  font-weight: 650;
  background: rgba(31, 28, 26, 0.06);
  color: var(--ink);
}

.setup-steps__item.is-active .setup-steps__num {
  background: var(--accent);
  color: #fff;
}

.setup-steps__item.is-done .setup-steps__num {
  background: var(--accent-soft, #fce8e4);
  color: var(--accent);
}

.setup-steps__label {
  font-size: 0.72rem;
  color: var(--muted);
  text-align: center;
}

.setup-member-list {
  list-style: none;
  margin: 0 0 1.25rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.setup-member-list li {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--surface-solid, #fff);
  border: 1px solid rgba(31, 28, 26, 0.06);
  font-weight: 550;
}

.setup-member-list__dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  flex-shrink: 0;
}

.setup-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 520px) {
  .setup-row {
    grid-template-columns: 1fr;
  }
}
</style>
