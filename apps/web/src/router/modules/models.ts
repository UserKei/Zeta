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
        meta: {
          requiresAuth: true,
          activeMenu: 'models',
          title: '模型管理',
        },
        component: () => import('@/views/Models/index.vue'),
      },
    ],
  },
]
