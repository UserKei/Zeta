import Layout from '@/layout/index.vue'

export default [
  {
    path: '/knowledge-bases',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index',
        name: 'knowledge-bases',
        component: () => import('@/views/KnowledgeBases/index.vue'),
      },
      {
        path: 'detail/:id',
        name: 'knowledge-base-detail',
        component: () => import('@/views/KnowledgeBases/components/Detail.vue'),
      },
    ],
  },
]
