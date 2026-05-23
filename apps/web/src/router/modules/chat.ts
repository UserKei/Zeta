import Layout from '@/layout/index.vue'

export default [
  {
    path: '/chat',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'index/:agentId',
        name: 'agent-chat',
        component: () => import('@/views/Chat/index.vue'),
      },
    ],
  },
]
