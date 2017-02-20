<template>
    <div id="app">
        <router-view>
        </router-view>
    </div>
</template>

<script>
import CreateUser from './components/CreateUser'
import User from './components/User'

export default {
  name: 'app',
  components: {
    CreateUser,
    User
  }
}
</script>

<style>
#app {
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  height: 100%;
}
</style>
