import { createRouter, createWebHistory } from 'vue-router';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: { guest: true },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../views/ResetPasswordView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('../views/CalendarView.vue'),
      meta: { auth: true },
    },
    {
      path: '/setup',
      name: 'setup',
      component: () => import('../views/SetupView.vue'),
      meta: { auth: true },
    },
    {
      path: '/invite/:token',
      name: 'invite',
      component: () => import('../views/InviteAcceptView.vue'),
    },
    {
      path: '/join',
      name: 'join',
      component: () => import('../views/JoinByCodeView.vue'),
      meta: { auth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  if (!getActivePinia()) {
    return true;
  }

  const auth = useAuthStore();

  try {
    if (!auth.user && localStorage.getItem('fc_token')) {
      await auth.fetchMe();
    }
  } catch (e) {
    console.warn('[router] fetchMe failed', e);
  }

  if (to.meta.auth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.guest && auth.isAuthenticated) {
    if (
      to.name === 'login' ||
      to.name === 'register' ||
      to.name === 'forgot-password' ||
      to.name === 'reset-password'
    ) {
      return { name: 'home' };
    }
  }

  return true;
});

router.onError((error) => {
  console.error('[router]', error);
});
