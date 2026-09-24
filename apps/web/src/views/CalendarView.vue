<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FullCalendar from '@fullcalendar/vue3';
import type { CalendarApi } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  CalendarOptions,
  EventClickArg,
  DateSelectArg,
  EventInput,
  EventDropArg,
} from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import ruLocale from '@fullcalendar/core/locales/ru';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowDown,
  Plus,
  User,
  Grid,
  Ticket,
  Key,
  Lock,
  SwitchButton,
  Setting,
} from '@element-plus/icons-vue';
import { useAuthStore } from '../stores/auth';
import { useFamilyStore, type CalendarEvent } from '../stores/family';
import EventFormModal from '../components/EventFormModal.vue';
import CategoriesManager from '../components/CategoriesManager.vue';
import InvitationsManager from '../components/InvitationsManager.vue';
import FamilySettingsModal from '../components/FamilySettingsModal.vue';
import NotificationsBell from '../components/NotificationsBell.vue';
import { ApiError } from '../api/client';
import { useNotificationsStore } from '../stores/notifications';
import { PREDEFINE_COLORS } from '../constants/colors';
import {
  MEMBER_RELATION_OPTIONS,
  MemberRelation,
} from '@family-calendar/shared-types';

type AppView = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek';
type ColorBy = 'category' | 'member';

const VIEW_OPTIONS: Array<{ value: AppView; label: string }> = [
  { value: 'timeGridDay', label: 'День' },
  { value: 'timeGridWeek', label: 'Неделя' },
  { value: 'dayGridMonth', label: 'Месяц' },
  { value: 'listWeek', label: 'Список' },
];

const COLOR_BY_KEY = 'fc-color-by';

const auth = useAuthStore();
const store = useFamilyStore();
const notifications = useNotificationsStore();
const router = useRouter();
const route = useRoute();

const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null);
const currentView = ref<AppView>('timeGridWeek');
const showForm = ref(false);
const editing = ref<CalendarEvent | null>(null);
const initialStart = ref<Date | null>(null);
const initialEnd = ref<Date | null>(null);
const range = ref<{ from: string; to: string } | null>(null);
const bootstrapping = ref(true);

const showMemberForm = ref(false);
const showCategoriesModal = ref(false);
const showInvitesModal = ref(false);
const showFamilySettings = ref(false);
const showChangePassword = ref(false);
const showWelcome = ref(false);
const changePwd = reactive({
  current: '',
  next: '',
  next2: '',
});
const changingPassword = ref(false);
const newMember = ref({
  name: '',
  color: '#d95540',
  type: 'child',
  relation: MemberRelation.SON as string,
});

const isOwner = computed(
  () => !!auth.user && !!store.family && store.family.ownerId === auth.user.id,
);

const storedColorBy = localStorage.getItem(COLOR_BY_KEY);
const colorBy = ref<ColorBy>(storedColorBy === 'member' ? 'member' : 'category');

watch(colorBy, (v) => {
  localStorage.setItem(COLOR_BY_KEY, v);
  syncCalendarEvents();
});

function resolveEventColors(e: CalendarEvent) {
  const category = e.category.color || '#d95540';
  const member = e.participants[0]?.color || category;
  if (colorBy.value === 'member') {
    return { fill: member, stripe: category };
  }
  return { fill: category, stripe: member };
}

function formatClock(iso: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function participantDotsHtml(participants: CalendarEvent['participants']) {
  if (!participants.length) return '';
  const dots = participants
    .slice(0, 4)
    .map(
      (p) =>
        `<span class="fc-who-dot" style="background:${p.color}" title="${escapeHtml(p.name)}"></span>`,
    )
    .join('');
  return `<span class="fc-who-dots">${dots}</span>`;
}

const calendarEvents = computed<EventInput[]>(() =>
  store.filteredEvents.map((e) => {
    const { fill, stripe } = resolveEventColors(e);
    return {
      id: e.id,
      title: e.title,
      start: e.startsAtUtc,
      end: e.endsAtUtc,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      textColor: 'var(--ink)',
      classNames: ['fc-event--soft'],
      extendedProps: { raw: e, fill, stripe },
    };
  }),
);

const upcomingEvents = computed(() => {
  const now = Date.now();
  return [...store.filteredEvents]
    .filter((e) => new Date(e.endsAtUtc).getTime() >= now)
    .sort((a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime());
});

function getCalendarApi(): CalendarApi | null {
  return calendarRef.value?.getApi() ?? null;
}

function syncCalendarEvents() {
  const api = getCalendarApi();
  if (!api) return;
  // One shot replace — no empty frame between removeAll and add
  api.setOption('events', calendarEvents.value);
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function refresh(options?: { quiet?: boolean; force?: boolean }) {
  if (!range.value || !store.family) return;
  await store.loadEvents(range.value.from, range.value.to, {
    quiet: options?.quiet ?? true,
    force: options?.force,
  });
  await nextTick();
  syncCalendarEvents();
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refresh({ quiet: true });
  }, 80);
}

function masterIdOf(raw: CalendarEvent) {
  return raw.masterEventId ?? raw.id.split('__')[0];
}

async function persistDraggedEvent(info: {
  event: { start: Date | null; end: Date | null; extendedProps: Record<string, unknown> };
  revert: () => void;
}) {
  const raw = info.event.extendedProps.raw as CalendarEvent | undefined;
  const start = info.event.start;
  let end = info.event.end;
  if (!raw || !start) {
    info.revert();
    return;
  }
  // Month/all-day drop may omit end — keep original duration
  if (!end) {
    const duration =
      new Date(raw.endsAtUtc).getTime() - new Date(raw.startsAtUtc).getTime();
    end = new Date(start.getTime() + Math.max(duration, 30 * 60 * 1000));
  }

  if (raw.isRecurring) {
    try {
      await ElMessageBox.confirm(
        'Это повторяющееся событие. Перенести время для всей серии?',
        'Перенос серии',
        {
          type: 'warning',
          confirmButtonText: 'Перенести серию',
          cancelButtonText: 'Отмена',
        },
      );
    } catch {
      info.revert();
      return;
    }
  }

  const payload = {
    startsAtUtc: start.toISOString(),
    endsAtUtc: end.toISOString(),
    confirmConflict: false as boolean,
  };

  try {
    await store.saveEvent(payload, masterIdOf(raw));
    ElMessage.success('Время обновлено');
    await refresh({ quiet: true, force: true });
  } catch (e) {
    if (e instanceof ApiError && e.code === 'BUFFER_WARNING') {
      try {
        await ElMessageBox.confirm(
          `${e.message}\n\nСохранить всё равно?`,
          'Мало времени на дорогу',
          { type: 'warning', confirmButtonText: 'Сохранить', cancelButtonText: 'Отмена' },
        );
        await store.saveEvent({ ...payload, confirmConflict: true }, masterIdOf(raw));
        ElMessage.success('Время обновлено');
        await refresh({ quiet: true, force: true });
        return;
      } catch {
        info.revert();
        return;
      }
    }
    if (e instanceof ApiError) ElMessage.error(e.message);
    else ElMessage.error('Не удалось перенести событие');
    info.revert();
  }
}

function formatTimeRange(startsAtUtc: string, endsAtUtc: string) {
  const start = new Date(startsAtUtc);
  const end = new Date(endsAtUtc);
  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timeFmt = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

function setView(view: AppView) {
  currentView.value = view;
  getCalendarApi()?.changeView(view);
}

const calendarOptions = reactive<CalendarOptions>({
  plugins: [timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  locale: ruLocale,
  firstDay: 1,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: '',
  },
  buttonText: {
    today: 'Сегодня',
    day: 'День',
    week: 'Неделя',
    month: 'Месяц',
    list: 'Список',
  },
  height: 'auto',
  allDaySlot: false,
  slotMinTime: '06:00:00',
  slotMaxTime: '24:00:00',
  slotDuration: '00:30:00',
  slotLabelInterval: '01:00:00',
  slotLabelFormat: {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  eventTimeFormat: {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  nowIndicator: true,
  selectable: true,
  selectMirror: true,
  editable: true,
  eventStartEditable: true,
  eventDurationEditable: true,
  eventResizableFromStart: false,
  dragScroll: true,
  longPressDelay: 400,
  eventLongPressDelay: 400,
  weekends: true,
  dayMaxEvents: 4,
  eventMinHeight: 28,
  eventShortHeight: 40,
  slotEventOverlap: true,
  eventMaxStack: 4,
  moreLinkText: 'ещё',
  noEventsText: 'Нет событий в этом периоде',
  events: [],
  eventDidMount(info) {
    const fill = info.event.extendedProps.fill as string | undefined;
    const stripe = info.event.extendedProps.stripe as string | undefined;
    if (fill) info.el.style.setProperty('--event-fill', fill);
    if (stripe) info.el.style.setProperty('--event-stripe', stripe);
    info.el.classList.add('fc-event--draggable');
  },
  eventContent(arg) {
    const raw = arg.event.extendedProps.raw as CalendarEvent | undefined;
    if (!raw) return true;
    const title = escapeHtml(arg.event.title);
    const who = escapeHtml(raw.participants.map((p) => p.name).join(', '));
    const location = raw.location ? escapeHtml(raw.location) : '';
    const category = raw.category?.name ? escapeHtml(raw.category.name) : '';
    const dots = participantDotsHtml(raw.participants);
    const time = `${formatClock(raw.startsAtUtc)}–${formatClock(raw.endsAtUtc)}`;
    const isMonth = arg.view.type === 'dayGridMonth';
    const isList = arg.view.type.startsWith('list');
    const durationMin =
      (new Date(raw.endsAtUtc).getTime() - new Date(raw.startsAtUtc).getTime()) / 60000;
    const compact = durationMin < 45 && !isMonth && !isList;

    if (isMonth) {
      return {
        html: `<div class="fc-evt fc-evt--month">${dots}<span class="fc-evt__title">${title}</span></div>`,
      };
    }
    if (isList) {
      const meta = [who, location, category].filter(Boolean).join(' · ');
      return {
        html: `<div class="fc-evt fc-evt--list">${dots}<div><div class="fc-evt__title">${title}</div><div class="fc-evt__meta">${meta}</div></div></div>`,
      };
    }
    if (compact) {
      return {
        html: `<div class="fc-evt fc-evt--compact">${dots}<span class="fc-evt__title">${title}</span><span class="fc-evt__time">${time}</span></div>`,
      };
    }
    const metaLine = [who, location].filter(Boolean).join(' · ');
    return {
      html: `<div class="fc-evt">
        <div class="fc-evt__head">
          <span class="fc-evt__title">${title}</span>
          ${dots}
        </div>
        <div class="fc-evt__time">${time}</div>
        ${metaLine ? `<div class="fc-evt__meta">${metaLine}</div>` : ''}
        ${category ? `<div class="fc-evt__cat">${category}</div>` : ''}
      </div>`,
    };
  },
  select(info: DateSelectArg) {
    editing.value = null;
    initialStart.value = info.start;
    if (info.allDay) {
      const start = new Date(info.start);
      start.setHours(10, 0, 0, 0);
      initialStart.value = start;
      initialEnd.value = new Date(start.getTime() + 60 * 60 * 1000);
    } else {
      initialEnd.value = info.end;
    }
    showForm.value = true;
  },
  eventClick(info: EventClickArg) {
    editing.value = info.event.extendedProps.raw as CalendarEvent;
    showForm.value = true;
  },
  eventDrop(info: EventDropArg) {
    void persistDraggedEvent(info);
  },
  eventResize(info: EventResizeDoneArg) {
    void persistDraggedEvent(info);
  },
  datesSet(info) {
    currentView.value = info.view.type as AppView;
    range.value = {
      from: info.start.toISOString(),
      to: info.end.toISOString(),
    };
  },
});

async function ensureFamily() {
  if (!auth.user && getStoredTokenSafe()) {
    await auth.fetchMe();
  }
  const families = auth.user?.families ?? [];
  if (!families.length) {
    await router.push('/setup');
    return false;
  }
  await store.loadFamily(families[0].id);
  return true;
}

function getStoredTokenSafe() {
  try {
    return localStorage.getItem('fc_token');
  } catch {
    return null;
  }
}

watch(range, () => {
  scheduleRefresh();
});

watch(calendarEvents, () => {
  syncCalendarEvents();
});

onMounted(async () => {
  bootstrapping.value = true;
  notifications.bindRealtime();
  if (route.query.welcome === '1') {
    showWelcome.value = true;
    const q = { ...route.query };
    delete q.welcome;
    void router.replace({ path: route.path, query: q });
  }
  try {
    const ok = await ensureFamily();
    if (!ok) return;
    // datesSet мог сработать до загрузки семьи — догружаем события явно
    if (!range.value) {
      const api = getCalendarApi();
      if (api) {
        const view = api.view;
        range.value = {
          from: view.activeStart.toISOString(),
          to: view.activeEnd.toISOString(),
        };
      }
    }
    await refresh({ quiet: true });
    await notifications.load();
  } finally {
    bootstrapping.value = false;
  }
});

onUnmounted(() => {
  if (refreshTimer) clearTimeout(refreshTimer);
  store.stopRealtime();
});

function openCreate() {
  editing.value = null;
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  initialStart.value = start;
  initialEnd.value = new Date(start.getTime() + 60 * 60 * 1000);
  showForm.value = true;
}

function openEvent(event: CalendarEvent) {
  editing.value = event;
  showForm.value = true;
}

async function addMember() {
  if (!newMember.value.name) return;
  try {
    await store.addMember(newMember.value);
    ElMessage.success('Участник добавлен');
    newMember.value = {
      name: '',
      color: '#d95540',
      type: 'child',
      relation: MemberRelation.SON,
    };
    showMemberForm.value = false;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось добавить');
  }
}

function onMoreCommand(cmd: string) {
  if (cmd === 'settings') {
    if (!isOwner.value) {
      ElMessage.warning('Настройки семьи доступны только организатору');
      return;
    }
    showFamilySettings.value = true;
  }
  if (cmd === 'member') {
    if (!isOwner.value) {
      ElMessage.warning('Участников может добавлять только организатор');
      return;
    }
    showMemberForm.value = true;
  }
  if (cmd === 'categories') {
    if (!isOwner.value) {
      ElMessage.warning('Категории настраивает организатор');
      return;
    }
    showCategoriesModal.value = true;
  }
  if (cmd === 'invites') {
    if (!isOwner.value) {
      ElMessage.warning('Приглашения создаёт организатор');
      return;
    }
    showInvitesModal.value = true;
  }
  if (cmd === 'join') void router.push('/join');
  if (cmd === 'password') {
    changePwd.current = '';
    changePwd.next = '';
    changePwd.next2 = '';
    showChangePassword.value = true;
  }
  if (cmd === 'logout') logout();
}

async function submitChangePassword() {
  if (changePwd.next.length < 6) {
    ElMessage.warning('Новый пароль не короче 6 символов');
    return;
  }
  if (changePwd.next !== changePwd.next2) {
    ElMessage.warning('Пароли не совпадают');
    return;
  }
  changingPassword.value = true;
  try {
    await auth.changePassword(changePwd.current, changePwd.next);
    ElMessage.success('Пароль изменён');
    showChangePassword.value = false;
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : 'Не удалось сменить пароль');
  } finally {
    changingPassword.value = false;
  }
}

/** Close one dialog fully before opening another — avoids double overlay flicker */
async function openAdminModal(target: 'categories' | 'invites') {
  showFamilySettings.value = false;
  showMemberForm.value = false;
  showCategoriesModal.value = false;
  showInvitesModal.value = false;
  await nextTick();
  await new Promise((r) => setTimeout(r, 280));
  if (target === 'categories') showCategoriesModal.value = true;
  else showInvitesModal.value = true;
}

function logout() {
  store.stopRealtime();
  notifications.reset();
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="app-shell" v-loading="bootstrapping">
    <el-alert
      v-if="showWelcome"
      class="welcome-banner"
      type="success"
      :closable="true"
      show-icon
      title="Семья готова"
      description="Кликните по свободному слоту в календаре, чтобы добавить событие. Участников и категории — в меню «Ещё»."
      @close="showWelcome = false"
    />
    <header class="topbar">
      <div>
        <div class="brand">Семейный календарь</div>
        <div class="topbar__meta">
          <span>{{ store.family?.name ?? 'Загрузка…' }}</span>
          <el-tag v-if="isOwner" size="small" effect="plain" type="danger" round>
            Организатор
          </el-tag>
          <template v-if="auth.user">
            <el-divider direction="vertical" />
            <span>{{ auth.user.name }}</span>
          </template>
          <span v-if="store.realtimeConnected" class="live-dot" title="Живое обновление">
            live
          </span>
        </div>
      </div>

      <div class="topbar__actions">
        <NotificationsBell />
        <el-button type="primary" :icon="Plus" @click="openCreate">Событие</el-button>
        <el-dropdown
          trigger="click"
          placement="bottom-end"
          popper-class="more-menu-popper"
          @command="onMoreCommand"
        >
          <el-button>
            Ещё
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu class="more-menu">
              <template v-if="isOwner">
                <div class="more-menu__label">Семья</div>
                <el-dropdown-item command="settings">
                  <span class="more-menu__item">
                    <span class="more-menu__icon" aria-hidden="true">
                      <el-icon :size="18"><Setting /></el-icon>
                    </span>
                    <span class="more-menu__text">
                      <span class="more-menu__title">Настройки семьи</span>
                      <span class="more-menu__hint">Название, пояс, участники</span>
                    </span>
                  </span>
                </el-dropdown-item>
                <el-dropdown-item command="member">
                  <span class="more-menu__item">
                    <span class="more-menu__icon" aria-hidden="true">
                      <el-icon :size="18"><User /></el-icon>
                    </span>
                    <span class="more-menu__text">
                      <span class="more-menu__title">Участник</span>
                      <span class="more-menu__hint">Добавить ребёнка или взрослого</span>
                    </span>
                  </span>
                </el-dropdown-item>
                <el-dropdown-item command="categories">
                  <span class="more-menu__item">
                    <span class="more-menu__icon" aria-hidden="true">
                      <el-icon :size="18"><Grid /></el-icon>
                    </span>
                    <span class="more-menu__text">
                      <span class="more-menu__title">Категории</span>
                      <span class="more-menu__hint">Типы и цвета событий</span>
                    </span>
                  </span>
                </el-dropdown-item>
                <el-dropdown-item command="invites">
                  <span class="more-menu__item">
                    <span class="more-menu__icon" aria-hidden="true">
                      <el-icon :size="18"><Ticket /></el-icon>
                    </span>
                    <span class="more-menu__text">
                      <span class="more-menu__title">Приглашения</span>
                      <span class="more-menu__hint">Ссылки и коды для вступления</span>
                    </span>
                  </span>
                </el-dropdown-item>
              </template>
              <div class="more-menu__label">Аккаунт</div>
              <el-dropdown-item command="password">
                <span class="more-menu__item">
                  <span class="more-menu__icon" aria-hidden="true">
                    <el-icon :size="18"><Lock /></el-icon>
                  </span>
                  <span class="more-menu__text">
                    <span class="more-menu__title">Сменить пароль</span>
                    <span class="more-menu__hint">Текущий и новый пароль</span>
                  </span>
                </span>
              </el-dropdown-item>
              <el-dropdown-item command="join">
                <span class="more-menu__item">
                  <span class="more-menu__icon" aria-hidden="true">
                    <el-icon :size="18"><Key /></el-icon>
                  </span>
                  <span class="more-menu__text">
                    <span class="more-menu__title">Код приглашения</span>
                    <span class="more-menu__hint">Присоединиться к другой семье</span>
                  </span>
                </span>
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <span class="more-menu__item more-menu__item--danger">
                  <span class="more-menu__icon more-menu__icon--danger" aria-hidden="true">
                    <el-icon :size="18"><SwitchButton /></el-icon>
                  </span>
                  <span class="more-menu__text">
                    <span class="more-menu__title">Выйти</span>
                    <span class="more-menu__hint">Завершить сеанс</span>
                  </span>
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <el-dialog
      v-model="showMemberForm"
      title="Добавить участника"
      width="440px"
      align-center
      append-to-body
      destroy-on-close
    >
      <el-form label-position="top" size="large">
        <el-form-item label="Имя">
          <el-input v-model="newMember.name" placeholder="Имя участника" />
        </el-form-item>
        <el-form-item label="Цвет">
          <el-color-picker
            v-model="newMember.color"
            size="large"
            color-format="hex"
            :clearable="false"
            :predefine="PREDEFINE_COLORS"
          />
        </el-form-item>
        <el-form-item label="Кем приходится">
          <el-select v-model="newMember.relation" style="width: 100%">
            <el-option
              v-for="opt in MEMBER_RELATION_OPTIONS"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Тип доступа">
          <el-select v-model="newMember.type" style="width: 100%">
            <el-option label="Взрослый" value="adult" />
            <el-option label="Ребёнок" value="child" />
            <el-option label="Помощник" value="helper" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-space>
          <el-button @click="showMemberForm = false">Отмена</el-button>
          <el-button type="primary" @click="addMember">Добавить</el-button>
        </el-space>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showChangePassword"
      title="Сменить пароль"
      width="440px"
      align-center
      append-to-body
      destroy-on-close
      class="airy-dialog"
    >
      <el-form label-position="top" size="large" @submit.prevent="submitChangePassword">
        <el-form-item label="Текущий пароль">
          <el-input
            v-model="changePwd.current"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item label="Новый пароль">
          <el-input
            v-model="changePwd.next"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="Ещё раз">
          <el-input
            v-model="changePwd.next2"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-space>
          <el-button @click="showChangePassword = false">Отмена</el-button>
          <el-button type="primary" :loading="changingPassword" @click="submitChangePassword">
            Сохранить
          </el-button>
        </el-space>
      </template>
    </el-dialog>

    <FamilySettingsModal
      v-model="showFamilySettings"
      @open-categories="openAdminModal('categories')"
      @open-invites="openAdminModal('invites')"
    />

    <el-dialog
      v-model="showCategoriesModal"
      title="Управление категориями"
      width="580px"
      align-center
      append-to-body
      destroy-on-close
      class="airy-dialog"
    >
      <CategoriesManager />
    </el-dialog>

    <el-dialog
      v-model="showInvitesModal"
      title="Приглашения"
      width="680px"
      align-center
      append-to-body
      destroy-on-close
      class="airy-dialog"
    >
      <InvitationsManager />
    </el-dialog>

    <div class="layout-calendar">
      <aside class="filters-panel">
        <section class="panel">
          <h2 class="panel__title">Цвет событий</h2>
          <el-segmented
            v-model="colorBy"
            :options="[
              { label: 'Категория', value: 'category' },
              { label: 'Участник', value: 'member' },
            ]"
            block
            style="width: 100%"
          />
          <p class="panel__hint">
            <template v-if="colorBy === 'category'">
              Заливка — тип события, полоска слева — кто участвует
            </template>
            <template v-else>
              Заливка — участник, полоска слева — категория
            </template>
          </p>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">Участники</h2>
            <el-button
              v-if="isOwner"
              link
              type="primary"
              @click="showFamilySettings = true"
            >
              Настроить
            </el-button>
          </div>
          <p class="panel__hint">
            {{ colorBy === 'member' ? 'Цвет = заливка блока' : 'Цвет = полоска и точки' }} · пустой
            фильтр — все
          </p>
          <div class="filter-list">
            <el-check-tag
              v-for="m in store.family?.members"
              :key="m.id"
              :checked="store.selectedMemberIds.includes(m.id)"
              style="justify-content: flex-start; width: 100%"
              @change="store.toggleMember(m.id)"
            >
              <span class="dot" :style="{ background: m.color }" />
              {{ m.name }}
            </el-check-tag>
          </div>
        </section>

        <section class="panel">
          <div class="panel__head">
            <h2 class="panel__title">Категории</h2>
            <el-button
              v-if="isOwner"
              link
              type="primary"
              @click="showCategoriesModal = true"
            >
              Управление
            </el-button>
          </div>
          <p class="panel__hint">
            {{ colorBy === 'category' ? 'Цвет = заливка блока' : 'Цвет = полоска слева' }} · фильтр
            по типу
          </p>
          <div class="filter-chips">
            <el-check-tag
              v-for="c in store.categories"
              :key="c.id"
              :checked="store.selectedCategoryIds.includes(c.id)"
              @change="store.toggleCategory(c.id)"
            >
              <span class="dot" :style="{ background: c.color }" />
              {{ c.name }}
            </el-check-tag>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel__title">Конфликты</h2>
          <el-empty
            v-if="!store.conflicts.length"
            description="Пересечений нет"
            :image-size="56"
          />
          <el-timeline v-else>
            <el-timeline-item
              v-for="(c, i) in store.conflicts"
              :key="i"
              :type="c.severity === 'hard' ? 'danger' : 'warning'"
              :hollow="true"
            >
              <strong>{{ c.eventTitle }}</strong>
              <div class="muted" style="font-size: 0.85rem; margin-top: 0.2rem">
                {{ c.message }}
              </div>
            </el-timeline-item>
          </el-timeline>
        </section>

        <section class="panel">
          <h2 class="panel__title">Ближайшие</h2>
          <el-empty
            v-if="!upcomingEvents.length"
            description="На этой неделе пока пусто — создайте первое событие"
            :image-size="56"
          >
            <el-button type="primary" size="small" @click="openCreate">Создать</el-button>
          </el-empty>
          <div v-else class="upcoming-list">
            <button
              v-for="e in upcomingEvents.slice(0, 8)"
              :key="e.id"
              type="button"
              class="upcoming-item"
              @click="openEvent(e)"
            >
              <span class="upcoming-item__swatches">
                <span
                  class="dot"
                  :title="e.category.name"
                  :style="{ background: e.category.color }"
                />
                <span
                  v-for="p in e.participants.slice(0, 3)"
                  :key="p.id"
                  class="dot"
                  :title="p.name"
                  :style="{ background: p.color }"
                />
              </span>
              <span class="upcoming-item__body">
                <strong>{{ e.title }}</strong>
                <span class="muted">{{ formatTimeRange(e.startsAtUtc, e.endsAtUtc) }}</span>
                <span class="muted">{{ e.participants.map((p) => p.name).join(', ') }}</span>
              </span>
            </button>
          </div>
        </section>
      </aside>

      <main class="calendar-panel">
        <div class="calendar-shell" :class="{ 'is-refreshing': store.loading }">
          <div class="view-toolbar">
            <el-segmented
              :model-value="currentView"
              :options="VIEW_OPTIONS"
              size="default"
              @change="(v: string | number | boolean) => setView(v as AppView)"
            />
          </div>
          <div class="calendar-scroll">
            <FullCalendar ref="calendarRef" :options="calendarOptions" />
          </div>
        </div>
      </main>
    </div>

    <EventFormModal
      v-if="showForm"
      :event="editing"
      :initial-start="initialStart"
      :initial-end="initialEnd"
      @close="showForm = false"
      @saved="() => refresh({ quiet: true, force: true })"
    />
  </div>
</template>
