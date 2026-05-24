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
        meta: {
          requiresAuth: true,
          activeMenu: 'agents',
          title: 'Agent 聊天',
        },
        component: () => import('@/views/Chat/index.vue'),
      },
    ],
  },
]
