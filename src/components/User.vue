<template>
  <div class='wrapper'>
    <nav class='z-depth-0'>
      <div class="nav-wrapper">
        <img class="left nav-logo" src="../assets/iroha_logo.svg" alt="">
        <span class='right value-text'>{{ value }}IRH</span>
      </div>
    </nav>
    <div class="row contents">
      <div class="col s2 side-menu">
        <div class="section">
          <span>
            <img class='menu-icon' src="../assets/wallet.svg" alt="">
            <router-link to='/user/wallet'>Wallet</router-link>
          </span>
        </div>
        <div class="divider"></div>
        <div class="section">
          <span>
            <img class='menu-icon' src="../assets/send.svg" alt="">
            <router-link to='/user/send'>Send</router-link>
          </span>
        </div>
        <div class="divider"></div>

        <div class="section">
          <span>
            <img class='menu-icon' src="../assets/receive.svg" alt="">
            <router-link to='/user/receive'>Receive</router-link>
          </span>
        </div>
        <div class="divider"></div>
        <div class="section">
          <span>
            <img class='menu-icon' src="../assets/wallet.svg" alt="">
            <router-link to='/user/explore'>Explore</router-link>
          </span>
        </div>
        <div class="divider"></div>

      </div>
      <div class="col s10 main">
        <router-view>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script>
import Wallet from './Wallet'
import Send from './Send'
import Receive from './Receive'
import Explore from './Explore'
import axios from 'axios'

export default {
  name: 'user',
  data () {
    return {
      value: ''
    }
  },
  created () {
    if (!this.$localStorage.get('publicKey')) {
      this.$router.push('/')
    }
    this.fetchAccount()
  },
  methods: {
    fetchAccount () {
      console.log('fetchAccount')
      /* eslint-disable no-undef */
      const url = `${IROHA_URL}/api/v1/account`
      let uuid = this.$localStorage.get('uuid')
      axios.get(url, {
        params: {
          uuid: uuid
        }
      })
      .then((response) => {
        console.log(response)
        if (response.data.status === 200) {
          this.value = response.data.assets[0].value
        }
      })
      .catch((error) => {
        console.error(error)
      })
    }
  },
  components: {
    Wallet,
    Send,
    Explore,
    Receive
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style>
nav{
  background-color: #fff;
  padding: 0 30px;
  color: #000;
  font-size: 1.5em;
  font-weight: bold;
  height: 15%;
}

.nav-logo{
  height: 90%;
}
.value-text{
  //line-height: 150px;
}

.wrapper{
  height: 100%;
}

.contents{
  height: 85%;
  margin-bottom: 0;
}

.side-menu{
  height: 100%;
  background-color: #DB0722;
  color: #fff;
}

.menu-icon{
  width: 10%;
  vertical-align: middle;
  margin-right: 5px;
}
a,a:hover,a:visited{
  color: #fff;
}

.section{
  height: 10%;
  padding-top: 15%;
}
.section > span{
  float: left;
}
.main{
  height: 100%;
}

</style>
