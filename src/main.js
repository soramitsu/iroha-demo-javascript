// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue'
import Router from 'vue-router'
import App from './App'
import VueLocalStorage from 'vue-localstorage'

import CreateUser from './components/CreateUser'
import User from './components/User'
import Wallet from './components/Wallet'
import Send from './components/Send'
import Receive from './components/Receive'
import Explore from './components/Explore'

Vue.use(Router)
Vue.use(VueLocalStorage)

const router = new Router({
  routes: [
    { path: '/', component: CreateUser },
    {
      path: '/user',
      component: User,
      children: [
        { path: 'wallet', component: Wallet },
        { path: 'send', component: Send },
        { path: 'explore', component: Explore },
        { path: 'receive', component: Receive }
      ]
    }
  ]
})

/* eslint-disable no-new */
new Vue({
  el: '#app',
  template: '<App/>',
  router: router,
  localStorage: {
    publicKey: {
      type: String,
      default: ''
    },
    privateKey: {
      type: String,
      default: ''
    },
    uuid: {
      type: String,
      default: ''
    }
  },
  components: { App }
})
