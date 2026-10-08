import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

// 使用 hash 路由：部署到 GitHub Pages 等静态托管时刷新页面不会 404
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: '地图' } },
    {
      path: '/dict',
      name: 'dict',
      component: () => import('./views/DictionaryView.vue'),
      meta: { title: 'Lineup 字典' },
    },
    {
      path: '/lineup/:id',
      name: 'lineup',
      component: () => import('./views/LineupDetailView.vue'),
      meta: { title: 'Lineup 详情' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : ''
  document.title = title ? `${title} · 无畏契约专精记忆` : '无畏契约专精记忆'
})
