<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { ConflictCheckResult } from '@family-calendar/shared-types';
import { useFamilyStore, type CalendarEvent } from '../stores/family';
import { ApiError } from '../api/client';

const props = defineProps<{
  event?: CalendarEvent | null;
  initialStart?: Date | null;
  initialEnd?: Date | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const store = useFamilyStore();
const conflictResult = ref<ConflictCheckResult | null>(null);
const saving = ref(false);
/** Копия открытого события — сохраняется как новое */
const asCopy = ref(false);

const WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

const REMINDER_OPTIONS = [
  { value: 0, label: 'В момент начала' },
  { value: 5, label: 'За 5 минут' },
  { value: 15, label: 'За 15 минут' },
  { value: 30, label: 'За 30 минут' },
  { value: 60, label: 'За 1 час' },
  { value: 120, label: 'За 2 часа' },
  { value: 1440, label: 'За 1 день' },
];

function parseRRule(rule?: string | null) {
  if (!rule) return null;
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/, '')
      .split(';')
      .map((p) => {
        const [k, v] = p.split('=');
        return [k, v];
      }),
  ) as Record<string, string>;

  const freqMap: Record<string, 'daily' | 'weekly' | 'monthly'> = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
  };
  const freq = freqMap[parts.FREQ ?? ''];
  if (!freq) return null;

  const dayMap: Record<string, number> = {
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
    SU: 7,
  };
  const byWeekday = parts.BYDAY
    ? parts.BYDAY.split(',')
        .map((d) => dayMap[d.replace(/^-?\d+/, '')])
        .filter(Boolean)
    : [];

  let until: Date | null = null;
  if (parts.UNTIL) {
    const raw = parts.UNTIL;
    until = new Date(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
    );
  }

  return {
    freq,
    interval: Number(parts.INTERVAL ?? 1),
    byWeekday,
    until,
  };
}

function toUntilString(d: Date | null) {
  if (!d) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const form = reactive({
  title: '',
  description: '',
  location: '',
  categoryId: '' as string,
  startsAt: (props.initialStart ?? new Date()) as Date,
  endsAt: (props.initialEnd ?? new Date(Date.now() + 60 * 60 * 1000)) as Date,
  participantIds: [] as string[],
  responsibleMemberId: '' as string,
  travelBufferMinutes: store.family?.travelBufferDefault ?? 15,
  confirmConflict: false,
  repeatEnabled: false,
  freq: 'weekly' as 'daily' | 'weekly' | 'monthly',
  interval: 1,
  byWeekday: [] as number[],
  until: null as Date | null,
  reminderMinutes: [15] as number[],
});

onMounted(() => {
  if (props.event) {
    form.title = props.event.title;
    form.description = props.event.description ?? '';
    form.location = props.event.location ?? '';
    form.categoryId = props.event.categoryId;
    form.startsAt = new Date(props.event.startsAtUtc);
    form.endsAt = new Date(props.event.endsAtUtc);
    form.participantIds = [...props.event.participantIds];
    form.responsibleMemberId = props.event.responsibleMemberId ?? '';
    form.travelBufferMinutes = props.event.travelBufferMinutes ?? 15;
    form.reminderMinutes = [...(props.event.reminderMinutes ?? [])];
    const parsed = parseRRule(props.event.recurrenceRule);
    if (parsed) {
      form.repeatEnabled = true;
      form.freq = parsed.freq;
      form.interval = parsed.interval;
      form.byWeekday = parsed.byWeekday;
      form.until = parsed.until;
    }
  } else {
    // Участников не подставляем — пользователь выбирает сам; без них сохранить нельзя
    if (store.categories.length) form.categoryId = store.categories[0].id;
    const start = props.initialStart ?? form.startsAt;
    const isoDay = ((start.getDay() + 6) % 7) + 1;
    form.byWeekday = [isoDay];
    const until = new Date(start);
    until.setMonth(until.getMonth() + 3);
    form.until = until;
  }
});

const adults = computed(() =>
  (store.family?.members ?? []).filter((m) =>
    ['owner', 'adult', 'helper'].includes(m.type),
  ),
);

const membersById = computed(() => {
  const map = new Map<string, { id: string; name: string; color: string }>();
  for (const m of store.family?.members ?? []) {
    map.set(m.id, m);
  }
  return map;
});

const selectedParticipants = computed(() =>
  form.participantIds
    .map((id) => membersById.value.get(id))
    .filter((m): m is { id: string; name: string; color: string } => !!m),
);

const responsibleMember = computed(() =>
  form.responsibleMemberId ? membersById.value.get(form.responsibleMemberId) : null,
);

const selectedCategory = computed(() =>
  store.categories.find((c) => c.id === form.categoryId) ?? null,
);

function chipStyle(color: string) {
  return {
    background: `color-mix(in srgb, ${color} 18%, #ffffff)`,
    borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
    color: 'var(--ink)',
  };
}

function removeParticipant(id: string) {
  form.participantIds = form.participantIds.filter((x) => x !== id);
}

const hardConflicts = computed(
  () => conflictResult.value?.conflicts.filter((c) => c.severity === 'hard') ?? [],
);
const bufferWarnings = computed(
  () => conflictResult.value?.conflicts.filter((c) => c.severity === 'buffer') ?? [],
);

const masterEventId = computed(() => {
  if (asCopy.value || !props.event) return undefined;
  return props.event.masterEventId ?? props.event.id.split('__')[0];
});

const dialogTitle = computed(() => {
  if (asCopy.value) return 'Копия события';
  return props.event ? 'Редактировать событие' : 'Новое событие';
});

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function timeOf(d: Date) {
  let total = d.getHours() * 60 + d.getMinutes();
  total = Math.round(total / 15) * 15;
  if (total >= 24 * 60) total = 23 * 60 + 45;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function combineDateTime(date: Date, time: string) {
  const [h, m] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(h, m, 0, 0);
  return next;
}

const startDate = computed({
  get: () => form.startsAt,
  set: (val: Date | null) => {
    if (!val) return;
    onStartChange(combineDateTime(val, timeOf(form.startsAt)));
  },
});

const startTime = computed({
  get: () => timeOf(form.startsAt),
  set: (val: string) => {
    if (!val) return;
    onStartChange(combineDateTime(form.startsAt, val));
  },
});

const endDate = computed({
  get: () => form.endsAt,
  set: (val: Date | null) => {
    if (!val) return;
    form.endsAt = combineDateTime(val, timeOf(form.endsAt));
  },
});

const endTime = computed({
  get: () => timeOf(form.endsAt),
  set: (val: string) => {
    if (!val) return;
    form.endsAt = combineDateTime(form.endsAt, val);
  },
});

function copyAsNew() {
  asCopy.value = true;
  form.confirmConflict = false;
  conflictResult.value = null;
  const dayMs = 24 * 60 * 60 * 1000;
  form.startsAt = new Date(form.startsAt.getTime() + dayMs);
  form.endsAt = new Date(form.endsAt.getTime() + dayMs);
  if (form.repeatEnabled) form.repeatEnabled = false;
  ElMessage.success('Создана копия на завтра — при необходимости поправьте время и сохраните');
}

function buildRecurrencePayload() {
  if (!form.repeatEnabled) return undefined;
  return {
    freq: form.freq,
    interval: form.interval,
    byWeekday: form.freq === 'weekly' ? form.byWeekday : undefined,
    until: toUntilString(form.until),
  };
}

async function check() {
  if (!form.participantIds.length || !form.startsAt || !form.endsAt) return;
  conflictResult.value = await store.checkConflicts({
    startsAtUtc: form.startsAt.toISOString(),
    endsAtUtc: form.endsAt.toISOString(),
    participantIds: form.participantIds,
    responsibleMemberId: form.responsibleMemberId || undefined,
    travelBufferMinutes: form.travelBufferMinutes,
    title: form.title || 'Новое событие',
    eventId: masterEventId.value,
    recurrence: buildRecurrencePayload(),
  });
}

watch(
  () => [
    form.startsAt?.getTime(),
    form.endsAt?.getTime(),
    [...form.participantIds],
    form.responsibleMemberId,
    form.travelBufferMinutes,
    form.repeatEnabled,
    form.freq,
    form.interval,
    [...form.byWeekday],
    form.until?.getTime(),
  ],
  async () => {
    try {
      await check();
    } catch {
      /* ignore */
    }
  },
);

function onStartChange(val: string | number | Date | null) {
  if (!val) return;
  const next = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(next.getTime())) return;
  form.startsAt = next;
  if (form.endsAt.getTime() <= next.getTime()) {
    form.endsAt = new Date(next.getTime() + 60 * 60 * 1000);
  }
}

async function submit(forceConfirm = false) {
  if (!form.categoryId) {
    ElMessage.warning('Выберите категорию');
    return;
  }
  if (!form.participantIds.length) {
    ElMessage.warning('Выберите хотя бы одного участника');
    return;
  }
  if (!form.startsAt || !form.endsAt) {
    ElMessage.warning('Укажите время начала и окончания');
    return;
  }
  if (form.repeatEnabled && form.freq === 'weekly' && !form.byWeekday.length) {
    ElMessage.warning('Выберите дни недели');
    return;
  }
  saving.value = true;
  try {
    if (forceConfirm) form.confirmConflict = true;
    const recurrence = form.repeatEnabled
      ? buildRecurrencePayload()
      : props.event?.isRecurring
        ? null
        : undefined;

    await store.saveEvent(
      {
        title: form.title,
        description: form.description || undefined,
        location: form.location || undefined,
        categoryId: form.categoryId,
        startsAtUtc: form.startsAt.toISOString(),
        endsAtUtc: form.endsAt.toISOString(),
        timezone: store.family?.timezone ?? 'Europe/Moscow',
        participantIds: form.participantIds,
        responsibleMemberId: form.responsibleMemberId || undefined,
        travelBufferMinutes: form.travelBufferMinutes,
        confirmConflict: form.confirmConflict,
        reminderMinutes: form.reminderMinutes,
        ...(recurrence !== undefined ? { recurrence } : {}),
      },
      masterEventId.value,
    );
    ElMessage.success('Событие сохранено');
    emit('saved');
    emit('close');
  } catch (e) {
    if (e instanceof ApiError) {
      ElMessage.error(e.message);
      if (e.details && typeof e.details === 'object') {
        conflictResult.value = e.details as ConflictCheckResult;
      }
    } else {
      ElMessage.error('Не удалось сохранить');
    }
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.event) return;
  try {
    if (props.event.isRecurring) {
      const action = await ElMessageBox.confirm(
        'Что удалить?',
        'Повторяющееся событие',
        {
          distinguishCancelAndClose: true,
          confirmButtonText: 'Только это',
          cancelButtonText: 'Всю серию',
          type: 'warning',
        },
      ).then(
        () => 'occurrence' as const,
        (action: string) => (action === 'cancel' ? ('series' as const) : null),
      );
      if (!action) return;
      await store.deleteEvent(props.event.id, {
        scope: action,
        occurrenceStartsAtUtc:
          props.event.occurrenceStartsAtUtc ?? props.event.startsAtUtc,
      });
    } else {
      await ElMessageBox.confirm('Удалить событие?', 'Подтверждение', {
        type: 'warning',
      });
      await store.deleteEvent(props.event.id, { scope: 'series' });
    }
    ElMessage.success('Удалено');
    emit('saved');
    emit('close');
  } catch {
    /* cancelled */
  }
}
</script>

<template>
  <el-dialog
    model-value
    :title="dialogTitle"
    width="920px"
    align-center
    append-to-body
    destroy-on-close
    class="event-dialog"
    @close="emit('close')"
  >
    <el-form label-position="top" size="large" class="event-form" @submit.prevent="submit(false)">
      <el-form-item label="Название" required class="event-form__full">
        <el-input v-model="form.title" placeholder="Например, футбол" clearable />
      </el-form-item>

      <div class="event-form__grid">
        <el-form-item label="Категория" required>
          <el-select
            v-model="form.categoryId"
            placeholder="Выберите категорию"
            filterable
            style="width: 100%"
          >
            <template v-if="selectedCategory" #prefix>
              <span class="select-chip-dot" :style="{ background: selectedCategory.color }" />
            </template>
            <el-option v-for="c in store.categories" :key="c.id" :label="c.name" :value="c.id">
              <span class="option-with-dot">
                <span class="dot" :style="{ background: c.color }" />
                {{ c.name }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="Повторение">
          <el-switch v-model="form.repeatEnabled" active-text="Повторять событие" />
        </el-form-item>

        <el-form-item label="Начало" required>
          <div class="datetime-row">
            <el-date-picker
              v-model="startDate"
              type="date"
              placeholder="Дата"
              format="DD.MM.YYYY"
              :clearable="false"
              style="flex: 1.2"
            />
            <el-time-select
              v-model="startTime"
              start="06:00"
              step="00:15"
              end="23:45"
              placeholder="Время"
              style="flex: 1"
            />
          </div>
        </el-form-item>

        <el-form-item label="Окончание" required>
          <div class="datetime-row">
            <el-date-picker
              v-model="endDate"
              type="date"
              placeholder="Дата"
              format="DD.MM.YYYY"
              :clearable="false"
              :disabled-date="(d: Date) => form.startsAt && d < new Date(form.startsAt.getFullYear(), form.startsAt.getMonth(), form.startsAt.getDate())"
              style="flex: 1.2"
            />
            <el-time-select
              v-model="endTime"
              start="06:00"
              step="00:15"
              end="23:45"
              placeholder="Время"
              style="flex: 1"
            />
          </div>
        </el-form-item>
      </div>

      <div v-if="form.repeatEnabled" class="event-form__grid event-form__repeat">
        <el-form-item label="Частота">
          <el-select v-model="form.freq" style="width: 100%">
            <el-option label="Каждый день" value="daily" />
            <el-option label="Каждую неделю" value="weekly" />
            <el-option label="Каждый месяц" value="monthly" />
          </el-select>
        </el-form-item>
        <el-form-item label="Интервал">
          <el-input-number
            v-model="form.interval"
            :min="1"
            :max="30"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="form.freq === 'weekly'" label="Дни недели" class="event-form__span2">
          <el-checkbox-group v-model="form.byWeekday">
            <el-checkbox-button v-for="d in WEEKDAYS" :key="d.value" :value="d.value">
              {{ d.label }}
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="Повторять до" class="event-form__span2">
          <el-date-picker
            v-model="form.until"
            type="date"
            placeholder="Дата окончания серии"
            format="DD.MM.YYYY"
            clearable
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <div class="event-form__grid">
        <el-form-item label="Участники" required>
          <el-select
            v-model="form.participantIds"
            multiple
            filterable
            placeholder="Кто участвует"
            class="member-select"
            style="width: 100%"
          >
            <template #tag>
              <div class="member-chips">
                <el-tag
                  v-for="m in selectedParticipants"
                  :key="m.id"
                  closable
                  class="member-chip"
                  :style="chipStyle(m.color)"
                  @close="removeParticipant(m.id)"
                >
                  <span class="member-chip__dot" :style="{ background: m.color }" />
                  {{ m.name }}
                </el-tag>
              </div>
            </template>
            <el-option
              v-for="m in store.family?.members"
              :key="m.id"
              :label="m.name"
              :value="m.id"
            >
              <span class="option-with-dot">
                <span class="dot" :style="{ background: m.color }" />
                {{ m.name }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="Ответственный за поездку">
          <el-select
            v-model="form.responsibleMemberId"
            clearable
            filterable
            placeholder="Не назначен"
            style="width: 100%"
          >
            <template v-if="responsibleMember" #prefix>
              <span class="select-chip-dot" :style="{ background: responsibleMember.color }" />
            </template>
            <el-option
              v-for="m in adults"
              :key="m.id"
              :label="m.name"
              :value="m.id"
            >
              <span class="option-with-dot">
                <span class="dot" :style="{ background: m.color }" />
                {{ m.name }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="Напоминания">
          <el-select
            v-model="form.reminderMinutes"
            multiple
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="Без напоминаний"
            style="width: 100%"
          >
            <el-option
              v-for="opt in REMINDER_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Буфер на дорогу (мин)">
          <el-input-number
            v-model="form.travelBufferMinutes"
            :min="0"
            :max="180"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="Место">
          <el-input v-model="form.location" placeholder="Адрес или место" clearable />
        </el-form-item>

        <el-form-item label="Описание">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="Необязательно"
            resize="none"
          />
        </el-form-item>
      </div>

      <el-alert
        v-if="hardConflicts.length"
        type="error"
        :closable="false"
        show-icon
        title="Конфликты"
        class="event-form__alert"
      >
        <ul class="conflict-list">
          <li v-for="(c, i) in hardConflicts" :key="i">{{ c.message }}</li>
        </ul>
      </el-alert>

      <el-alert
        v-else-if="bufferWarnings.length"
        type="warning"
        :closable="false"
        show-icon
        title="Мало времени на дорогу"
        class="event-form__alert"
      >
        <ul class="conflict-list">
          <li v-for="(c, i) in bufferWarnings" :key="i">{{ c.message }}</li>
        </ul>
        <el-checkbox v-model="form.confirmConflict" style="margin-top: 8px">
          Сохранить несмотря на предупреждение
        </el-checkbox>
      </el-alert>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <div class="dialog-footer__left">
          <el-button v-if="event && !asCopy" type="danger" plain @click="remove">Удалить</el-button>
          <el-button v-if="event && !asCopy" plain @click="copyAsNew">Копировать</el-button>
        </div>
        <div class="dialog-footer__right">
          <el-button @click="emit('close')">Отмена</el-button>
          <el-button
            v-if="bufferWarnings.length && !hardConflicts.length"
            :loading="saving"
            @click="submit(true)"
          >
            С подтверждением
          </el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!!hardConflicts.length || !form.participantIds.length"
            @click="submit(false)"
          >
            {{ asCopy ? 'Создать копию' : 'Сохранить' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.datetime-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  align-items: center;
}

.dialog-footer__left {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.event-form__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 1.1rem;
}

.event-form__span2 {
  grid-column: 1 / -1;
}

.event-form__alert {
  margin-top: 0.35rem;
  margin-bottom: 0.25rem;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.dialog-footer__right {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-left: auto;
}

.dialog-footer__right .el-button {
  min-width: 8.5rem;
  justify-content: center;
}

.member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.1rem 0;
}

.member-chip {
  display: inline-flex !important;
  align-items: center;
  gap: 0.35rem;
  border-width: 1px;
  border-style: solid;
  border-radius: 999px !important;
  font-weight: 600;
  height: 28px;
  padding: 0 0.55rem 0 0.4rem !important;
}

.member-chip__dot,
.select-chip-dot {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.7);
}

.select-chip-dot {
  margin-left: 0.15rem;
}

.member-select :deep(.el-select__selection) {
  gap: 0.25rem;
}

@media (max-width: 720px) {
  .event-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
