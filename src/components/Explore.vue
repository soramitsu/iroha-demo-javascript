<template>
  <div class='wallet-wrapper row'>
    <table class='col s8 offset-s2 centered wallet-table'>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>From</th>
          <th>To</th>
          <th>Ammount</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for='transaction in transactions'>
          <td>{{ transDate(transaction.timestamp )}}</td>
          <td class='key-cell'>{{ transaction.params.sender }}</td>
          <td class='key-cell'>{{ transaction.params.receiver }}</td>
          <td>{{ transaction.params.value }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import axios from 'axios'
import { w3cwebsocket as W3C } from 'websocket'
import moment from 'moment'

export default{
  name: 'list',
  data () {
    return {
      transactions: []
    }
  },
  created () {
    console.log('created')
    console.log(this.contracts)
    this.initWebSocket(this.contracts)
    this.fetchData()
  },
  methods: {
    fetchData () {
      const assetUuid = '60f4a396b520d6c54e33634d060751814e0c4bf103a81c58da704bba82461c32'
      /* eslint-disable no-undef */
      const url = `${IROHA_URL}/history/transaction?uuid=${assetUuid}`
      axios.get(url).then((response) => {
        console.log(response)
        if (response.data.status === 200) {
          console.log(response)
          this.transactions = response.data.history.reverse()
        }
      }).catch((response) => {
        console.log(response)
      })
    },
    initWebSocket () {
      /* eslint-disable no-undef */
      const url = `${IROHA_URL}/api/v1/history/transaction/ws`
      const wsUrl = 'wss:' + url.split(':')[1]
      console.log(wsUrl)
      var client = new W3C(wsUrl)
      client.onerror = () => {
        console.log('Connection Error')
      }
      client.onopen = () => {
        console.log('WebSocket Client Connected')
      }
      client.onclose = () => {
        console.log('echo-protocol Client Closed')
      }
      client.onmessage = (message) => {
        console.log(message)
        if (typeof message.data === 'string') {
          console.log(this)
          const data = JSON.parse(message.data)
          if (!this.transactions) {
            this.transactions = []
          }
          this.transactions.unshift(data)
          console.log(data)
        }
      }
    },
    transDate (timestamp) {
      const time = moment.unix(timestamp).format('YYYY/MM/DD HH:mm:ss')
      return time
    }
  }
}
</script>

<style>
.wallet-wrapper{
  height: 100%;
  overflow: scroll;
  margin-bottom: 0px;
}

.wallet-table{
  table-layout: fixed;
  border: 2px solid #000;
}

.wallet-table > thead > tr{
  background-color: #DB0722;
  color: #fff;
  border: 1px solid #fff;
}

.wallet-table > thead > tr > th{
  border: 1px solid #fff;;
}

.wallet-table > tbody > tr > td{
  border: 1px solid #000;

}

.key-cell{
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
