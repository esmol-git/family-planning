import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  api,
  setToken,
  getStoredToken,
  setRefreshToken,
  getRefreshToken,
  clearSession,
  ApiError,
  type AuthTokens,
} from '../api/client';

export type User = {
  id: string;
  login: string;
  email: string | null;
  name: string;
  families?: { id: string; name: string }[];
  memberships?: {
    familyId: string;
    memberId: string;
    type: string;
    relation: string;
  }[];
};

type AuthResponse = AuthTokens & { user: User };

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  let fetchMeSeq = 0;

  const isAuthenticated = computed(() => !!user.value);

  /** Владелец семьи или взрослый — может менять события/настройки; helper — только смотреть */
  function canEditFamily(familyId: string | undefined | null, ownerId?: string | null) {
    if (!user.value || !familyId) return false;
    if (ownerId && user.value.id === ownerId) return true;
    const membership = user.value.memberships?.find((m) => m.familyId === familyId);
    if (!membership) return false;
    return membership.type === 'owner' || membership.type === 'adult';
  }

  function applyAuth(res: AuthResponse) {
    setToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    user.value = res.user;
  }

  async function login(login: string, password: string) {
    loading.value = true;
    try {
      const res = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        json: { login, password },
        auth: false,
      });
      applyAuth(res);
      return res;
    } finally {
      loading.value = false;
    }
  }

  async function register(
    name: string,
    login: string,
    password: string,
    email?: string,
  ) {
    loading.value = true;
    try {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        json: {
          name,
          login,
          password,
          ...(email?.trim() ? { email: email.trim() } : {}),
        },
        auth: false,
      });
      applyAuth(res);
      return res;
    } finally {
      loading.value = false;
    }
  }

  async function fetchMe() {
    const tokenAtStart = getStoredToken();
    if (!tokenAtStart) {
      user.value = null;
      return null;
    }

    const seq = ++fetchMeSeq;
    try {
      const profile = await api<User>('/me');
      if (seq !== fetchMeSeq) return null;
      if (getStoredToken() !== tokenAtStart && getStoredToken() === null) return null;
      user.value = profile;
      return profile;
    } catch (e) {
      if (seq !== fetchMeSeq) return null;
      if (e instanceof ApiError && e.statusCode === 401) {
        user.value = null;
        clearSession();
      }
      return null;
    }
  }

  async function logout() {
    fetchMeSeq += 1;
    const refreshToken = getRefreshToken();
    try {
      if (getStoredToken()) {
        await api('/auth/logout', {
          method: 'POST',
          json: refreshToken ? { refreshToken } : {},
        });
      }
    } catch {
      /* ignore revoke errors */
    } finally {
      user.value = null;
      clearSession();
    }
  }

  async function forgotPassword(email: string) {
    return api<{ ok: boolean; message: string; devResetUrl?: string }>(
      '/auth/forgot-password',
      { method: 'POST', json: { email }, auth: false },
    );
  }

  async function resetPassword(token: string, newPassword: string) {
    return api<{ ok: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      json: { token, newPassword },
      auth: false,
    });
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const res = await api<AuthResponse>('/auth/change-password', {
      method: 'POST',
      json: { currentPassword, newPassword },
    });
    applyAuth(res);
    return res;
  }

  return {
    user,
    loading,
    isAuthenticated,
    canEditFamily,
    login,
    register,
    fetchMe,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
  };
});
