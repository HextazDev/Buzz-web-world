import { createRouter, createWebHistory } from 'vue-router';
import HostView from '../views/HostView.vue';
import ControllerView from '../views/ControllerView.vue';
import HubView from '../views/HubView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/host',
    },
    {
      path: '/host',
      name: 'host',
      component: HostView,
    },
    {
      path: '/controller',
      name: 'controller',
      component: ControllerView,
    },
    {
      path: '/hub',
      name: 'hub',
      component: HubView,
    },
  ],
});
