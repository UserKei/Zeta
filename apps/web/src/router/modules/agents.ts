import Layout from '@/layout/index.vue'
import WorkspaceLayout from '@/layout/workspace/index.vue'
import { MessageCircleIcon } from '@lucide/vue'
import type { RouteLocation } from 'vue-router'

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
      {
        path: ':agentId',
        component: WorkspaceLayout,
        redirect: (to: RouteLocation) => ({
          name: 'agent-chat-logs',
          params: to.params,
        }),
        meta: {
          requiresAuth: true,
          activeMenu: 'agents',
          workspaceTitle: '专家 Agent',
          workspaceSubtitle: '对话日志与知识反哺',
          workspaceBackRoute: 'agents',
          workspaceResourceType: 'agent',
          workspaceResourceIdParam: 'agentId',
        },
        children: [
          {
            path: 'chat-logs',
            name: 'agent-chat-logs',
            meta: {
              requiresAuth: true,
              activeMenu: 'agents',
              workspaceMenu: true,
              title: '对话日志',
              icon: MessageCircleIcon,
            },
            component: () => import('@/views/ChatLogs/index.vue'),
          },
        ],
      },
    ],
  },
]
