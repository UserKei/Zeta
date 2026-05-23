import Layout from '@/layout/index.vue'

export default [
  {
    path: '/models',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index',
        name: 'models',
        component: () => import('@/views/Models/index.vue'),
      },
    ],
  },
]
