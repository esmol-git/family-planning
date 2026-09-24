import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client';
import {
  connectRealtime,
  disconnectRealtime,
  joinFamilyRoom,
  leaveFamilyRoom,
  setRealtimeHandlers,
} from '../api/realtime';
import type { ConflictCheckResult } from '@family-calendar/shared-types';

export type Member = {
  id: string;
  familyId: string;
  userId?: string | null;
  name: string;
  color: string;
  type: string;
  relation: string;
  active: boolean;
};

export type Category = {
  id: string;
  familyId: string;
  name: string;
  color: string;
  sortOrder: number;
  active: boolean;
};

export type Family = {
  id: string;
  name: string;
  ownerId: string;
  travelBufferDefault: number;
  timezone: string;
  members: Member[];
  categories?: Category[];
};

export type CalendarEvent = {
  id: string;
  masterEventId?: string;
  familyId: string;
  title: string;
  description?: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  occurrenceStartsAtUtc?: string;
  timezone: string;
  location?: string | null;
  categoryId: string;
  category: { id: string; name: string; color: string };
  responsibleMemberId?: string | null;
  responsible?: { id: string; name: string; color: string } | null;
  travelBufferMinutes?: number | null;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  reminderMinutes?: number[];
  participantIds: string[];
  participants: { id: string; name: string; color: string; type: string }[];
};

export const useFamilyStore = defineStore('family', () => {
  const family = ref<Family | null>(null);
  const categories = ref<Category[]>([]);
  const events = ref<CalendarEvent[]>([]);
  const conflicts = ref<
    Array<{
      eventId: string;
      eventTitle: string;
      message: string;
      severity: string;
      kind: string;
    }>
  >([]);
  const selectedMemberIds = ref<string[]>([]);
  const selectedCategoryIds = ref<string[]>([]);
  const loading = ref(false);
  const lastRange = ref<{ from: string; to: string } | null>(null);
  /** Expanded window already in `events` — skip refetch when navigating inside it */
  const loadedWindow = ref<{ from: number; to: number } | null>(null);
  const realtimeConnected = ref(false);
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;
  let eventsLoadSeq = 0;

  const filteredEvents = computed(() => {
    return events.value.filter((e) => {
      if (selectedMemberIds.value.length) {
        const hit = e.participantIds.some((id) => selectedMemberIds.value.includes(id));
        if (!hit) return false;
      }
      if (selectedCategoryIds.value.length) {
        if (!selectedCategoryIds.value.includes(e.categoryId)) return false;
      }
      return true;
    });
  });

  async function loadFamily(familyId: string) {
    family.value = await api<Family>(`/families/${familyId}`);
    categories.value = family.value.categories ?? (await loadCategories());
    startRealtime(familyId);
  }

  function startRealtime(familyId: string) {
    setRealtimeHandlers({
      onEventsChanged: () => scheduleReload('events'),
      onMembersChanged: () => scheduleReload('members'),
      onCategoriesChanged: () => scheduleReload('categories'),
      onFamilyChanged: () => scheduleReload('family'),
    });
    connectRealtime();
    joinFamilyRoom(familyId);
    realtimeConnected.value = true;
  }

  function stopRealtime() {
    if (reloadTimer) {
      clearTimeout(reloadTimer);
      reloadTimer = null;
    }
    leaveFamilyRoom();
    disconnectRealtime();
    realtimeConnected.value = false;
  }

  function scheduleReload(kind: 'events' | 'members' | 'categories' | 'family') {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      void applyRealtime(kind);
    }, 250);
  }

  async function applyRealtime(kind: 'events' | 'members' | 'categories' | 'family') {
    if (!family.value) return;
    try {
      if (kind === 'members' || kind === 'family') {
        await loadFamilyQuiet(family.value.id);
      }
      if (kind === 'categories' || kind === 'family') {
        await loadCategories();
      }
      if (
        (kind === 'events' || kind === 'family' || kind === 'members') &&
        lastRange.value
      ) {
        await loadEvents(lastRange.value.from, lastRange.value.to, {
          quiet: true,
          force: true,
        });
      }
    } catch (e) {
      console.warn('[realtime] reload failed', e);
    }
  }

  async function loadFamilyQuiet(familyId: string) {
    family.value = await api<Family>(`/families/${familyId}`);
    if (family.value.categories) {
      categories.value = family.value.categories;
    }
  }

  async function loadCategories(includeInactive = false) {
    if (!family.value) return [];
    const q = includeInactive ? '?includeInactive=true' : '';
    categories.value = await api<Category[]>(
      `/families/${family.value.id}/categories${q}`,
    );
    return categories.value;
  }

  async function createFamily(name: string) {
    family.value = await api<Family>('/families', {
      method: 'POST',
      json: { name },
    });
    categories.value = family.value.categories ?? (await loadCategories());
    return family.value;
  }

  async function loadEvents(
    from: string,
    to: string,
    options?: { quiet?: boolean; force?: boolean },
  ) {
    if (!family.value) return;
    const visFrom = new Date(from).getTime();
    const visTo = new Date(to).getTime();
    lastRange.value = { from, to };

    if (
      !options?.force &&
      loadedWindow.value &&
      visFrom >= loadedWindow.value.from &&
      visTo <= loadedWindow.value.to
    ) {
      return;
    }

    const seq = ++eventsLoadSeq;
    const padMs = 7 * 24 * 60 * 60 * 1000;
    const fetchFrom = new Date(visFrom - padMs).toISOString();
    const fetchTo = new Date(visTo + padMs).toISOString();

    if (!options?.quiet) loading.value = true;
    try {
      const nextEvents = await api<CalendarEvent[]>(
        `/families/${family.value.id}/events?from=${encodeURIComponent(fetchFrom)}&to=${encodeURIComponent(fetchTo)}`,
      );
      if (seq !== eventsLoadSeq) return;
      events.value = nextEvents;
      loadedWindow.value = {
        from: new Date(fetchFrom).getTime(),
        to: new Date(fetchTo).getTime(),
      };

      const res = await api<{ conflicts: typeof conflicts.value }>(
        `/families/${family.value.id}/conflicts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (seq !== eventsLoadSeq) return;
      conflicts.value = res.conflicts;
    } finally {
      if (seq === eventsLoadSeq && !options?.quiet) loading.value = false;
    }
  }

  function invalidateEventsCache() {
    loadedWindow.value = null;
  }

  async function checkConflicts(payload: {
    startsAtUtc: string;
    endsAtUtc: string;
    participantIds: string[];
    responsibleMemberId?: string;
    travelBufferMinutes?: number;
    title?: string;
    eventId?: string;
    recurrence?: {
      freq: 'daily' | 'weekly' | 'monthly';
      interval?: number;
      byWeekday?: number[];
      until?: string;
    };
  }): Promise<ConflictCheckResult> {
    if (!family.value) throw new Error('Нет семьи');
    const masterId = payload.eventId?.split('__')[0];
    const path = masterId
      ? `/families/${family.value.id}/events/${encodeURIComponent(masterId)}/check-conflicts`
      : `/families/${family.value.id}/events/check-conflicts`;
    return api<ConflictCheckResult>(path, { method: 'POST', json: payload });
  }

  async function saveEvent(
    payload: Record<string, unknown>,
    eventId?: string,
  ): Promise<{ event: CalendarEvent; conflicts: ConflictCheckResult }> {
    if (!family.value) throw new Error('Нет семьи');
    invalidateEventsCache();
    if (eventId) {
      return api(`/families/${family.value.id}/events/${eventId}`, {
        method: 'PATCH',
        json: payload,
      });
    }
    return api(`/families/${family.value.id}/events`, {
      method: 'POST',
      json: payload,
    });
  }

  async function deleteEvent(
    eventId: string,
    options?: { scope?: 'series' | 'occurrence'; occurrenceStartsAtUtc?: string },
  ) {
    if (!family.value) return;
    invalidateEventsCache();
    const params = new URLSearchParams();
    if (options?.scope) params.set('scope', options.scope);
    if (options?.occurrenceStartsAtUtc) {
      params.set('occurrenceStartsAtUtc', options.occurrenceStartsAtUtc);
    }
    const qs = params.toString();
    await api(
      `/families/${family.value.id}/events/${encodeURIComponent(eventId)}${qs ? `?${qs}` : ''}`,
      { method: 'DELETE' },
    );
  }

  async function addMember(data: {
    name: string;
    color: string;
    type: string;
    relation?: string;
  }) {
    if (!family.value) return;
    const member = await api<Member>(`/families/${family.value.id}/members`, {
      method: 'POST',
      json: data,
    });
    family.value.members.push(member);
    return member;
  }

  async function updateFamily(data: {
    name?: string;
    travelBufferDefault?: number;
    timezone?: string;
  }) {
    if (!family.value) return;
    const updated = await api<Family>(`/families/${family.value.id}`, {
      method: 'PATCH',
      json: data,
    });
    family.value = {
      ...family.value,
      name: updated.name,
      travelBufferDefault: updated.travelBufferDefault,
      timezone: updated.timezone,
      members: updated.members ?? family.value.members,
    };
    return family.value;
  }

  async function updateMember(
    memberId: string,
    data: Partial<{
      name: string;
      color: string;
      type: string;
      relation: string;
      active: boolean;
    }>,
  ) {
    if (!family.value) return;
    const updated = await api<Member>(
      `/families/${family.value.id}/members/${memberId}`,
      { method: 'PATCH', json: data },
    );
    const idx = family.value.members.findIndex((m) => m.id === memberId);
    if (idx >= 0) family.value.members[idx] = updated;
    return updated;
  }

  async function deleteMember(memberId: string) {
    if (!family.value) return;
    await api(`/families/${family.value.id}/members/${memberId}`, {
      method: 'DELETE',
    });
    family.value.members = family.value.members.filter((m) => m.id !== memberId);
    selectedMemberIds.value = selectedMemberIds.value.filter((id) => id !== memberId);
  }

  async function createCategory(data: { name: string; color: string }) {
    if (!family.value) return;
    const category = await api<Category>(`/families/${family.value.id}/categories`, {
      method: 'POST',
      json: data,
    });
    categories.value.push(category);
    categories.value.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return category;
  }

  async function updateCategory(
    categoryId: string,
    data: Partial<{ name: string; color: string; active: boolean; sortOrder: number }>,
  ) {
    if (!family.value) return;
    const updated = await api<Category>(
      `/families/${family.value.id}/categories/${categoryId}`,
      { method: 'PATCH', json: data },
    );
    const idx = categories.value.findIndex((c) => c.id === categoryId);
    if (idx >= 0) categories.value[idx] = updated;
    return updated;
  }

  async function deleteCategory(categoryId: string) {
    if (!family.value) return;
    await api(`/families/${family.value.id}/categories/${categoryId}`, {
      method: 'DELETE',
    });
    categories.value = categories.value.filter((c) => c.id !== categoryId);
  }

  function toggleMember(id: string) {
    const idx = selectedMemberIds.value.indexOf(id);
    if (idx >= 0) selectedMemberIds.value.splice(idx, 1);
    else selectedMemberIds.value.push(id);
  }

  function toggleCategory(id: string) {
    const idx = selectedCategoryIds.value.indexOf(id);
    if (idx >= 0) selectedCategoryIds.value.splice(idx, 1);
    else selectedCategoryIds.value.push(id);
  }

  return {
    family,
    categories,
    events,
    conflicts,
    selectedMemberIds,
    selectedCategoryIds,
    filteredEvents,
    loading,
    lastRange,
    realtimeConnected,
    loadFamily,
    createFamily,
    loadCategories,
    loadEvents,
    invalidateEventsCache,
    checkConflicts,
    saveEvent,
    deleteEvent,
    addMember,
    updateFamily,
    updateMember,
    deleteMember,
    createCategory,
    updateCategory,
    deleteCategory,
    toggleMember,
    toggleCategory,
    stopRealtime,
  };
});
