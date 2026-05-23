import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import userRoutes from './modules/user'
import modelRoutes from './modules/models'
import knowledgeBaseRoutes from './modules/knowledge-bases'
import agentRoutes from './modules/agents'
import chatRoutes from './modules/chat'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'models' },
    },
    ...userRoutes,
    ...modelRoutes,
    ...knowledgeBaseRoutes,
    ...agentRoutes,
    ...chatRoutes,
  ],
})

router.beforeEach((to) => {
  const userStore = useUserStore()

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    return { name: 'login' }
  }

  if (to.name === 'login' && userStore.isLoggedIn) {
    return { name: 'models' }
  }
})

export default router
