export default [
  {
    path: '/chat/index/:agentId',
    name: 'agent-chat',
    meta: {
      requiresAuth: true,
      title: 'Agent 聊天',
    },
    component: () => import('@/views/Chat/index.vue'),
  },
]
