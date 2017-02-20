<template>
  <div class='row top-wrapper'>
    <img class='col s2 offset-s5 responsive-img center' src="../assets/iroha_logo.svg" alt="iroha image">
    <div class='input-field col s4 offset-s4'>
      <img class='col s2 offset-s5' src="../assets/user.svg" alt="user_icon">
      <input type='text' placeholder='Username' v-model='userName'>
      <button class='waves-effect btn z-depth-0' v-on:click='clickCreateUser()'>Create User</button>
    </div>
  </div>
</template>

<script>
import iroha from '../../../src/iroha.js'
import axios from 'axios'
import moment from 'moment'

export default {
  name: 'createUser',
  data () {
    return {
      userName: ''
    }
  },
  created () {
    if (!this.$localStorage.get('publicKey')) {
      this.$router.push('/')
    } else {
      this.$router.push('/user/wallet')
    }
  },
  methods: {
    clickCreateUser () {
      this.registAccount()
    },

    registAccount () {
      // ログイン処理を挟む
      var keys = iroha.createKeyPair()

      /* eslint-disable no-undef */
      const url = `${IROHA_URL}/account/register`
      axios.post(url, {
        'publicKey': keys.publicKey,
        'alias': this.userName,
        'timestamp': moment().unix()
      })
      .then((response) => {
        console.log(response)

        // save data
        this.$localStorage.set('publicKey', keys.publicKey)
        this.$localStorage.set('privateKey', keys.privateKey)
        this.$localStorage.set('uuid', response.data.uuid)

        this.$router.push('user/wallet')
      })
      .catch((error) => {
        console.error(error)
      })
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.top-wrapper{
  padding-top: 50px;
}
.input-field{
  padding-top: 100px;
}
</style>
