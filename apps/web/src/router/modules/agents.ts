import Layout from '@/layout/index.vue'

export default [
  {
    path: '/agents',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index',
        name: 'agents',
        meta: {
          requiresAuth: true,
          activeMenu: 'agents',
          title: '专家 Agent',
        },
        component: () => import('@/views/Agents/index.vue'),
      },
    ],
  },
]
