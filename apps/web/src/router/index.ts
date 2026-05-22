import { createRouter, createWebHistory } from 'vue-router'
import { hasAccessToken } from '@/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/',
      name: 'models',
      component: () => import('../views/ModelsView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !hasAccessToken()) {
    return { name: 'login' }
  }

  if (to.name === 'login' && hasAccessToken()) {
    return { name: 'models' }
  }
})

export default router
