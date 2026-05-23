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
        component: () => import('@/views/Agents/index.vue'),
      },
    ],
  },
]
