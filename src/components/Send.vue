<template>
  <div class='send-wrapper'>
    <div class="col s12">
      <video id="video" class='col s4 offset-s4'/>
    </div>
    <div class='input-field col s4 offset-s4'>
      <input type='text' placeholder='To' v-model='receiver'>
      <input type='number' placeholder='Ammount' v-model.number='amount'>
      <button v-on:click='sendValue()' class='waves-effect btn z-depth-0'>SEND</button>
    </div>
  </div>
</template>

<script>
import iroha from '../../../src/iroha.js'
import axios from 'axios'
import moment from 'moment'
import Qrcode from 'qrcode-reader'

export default {
  name: 'send',
  data () {
    return {
      amount: 0,
      vState: '',
      receiver: ''
    }
  },
  created () {
    console.log('created')
    this.prepareVideo()
  },
  methods: {
    sendValue () {
      if (this.amount === 0 || this.receiver) {
        console.error('param not found')
        return
      }
      /* eslint-disable no-undef */
      const url = `${IROHA_URL}/api/v1/asset/operation`
      const assetUuid = '60f4a396b520d6c54e33634d060751814e0c4bf103a81c58da704bba82461c32'
      let publicKey = this.$localStorage.get('publicKey')
      let timestamp = moment().unix()
      let command = 'transfer'
      let message = `timestamp:${timestamp},params.value:${this.amount},params.sender:${publicKey},params.receiver:${this.receiver},params.command:${command},asset-uuid:${assetUuid}`

      /* eslint-disable indent */
      let sign = iroha.createSignature({
        publicKey: publicKey,
        privateKey: this.$localStorage.get('privateKey'),
        message: message
      })

      axios.post(url, {
        'asset-uuid': assetUuid,
        'params': {
          'command': command,
          'value': this.amount,
          'sender': publicKey,
          'receiver': this.receiver
        },
        'signature': sign,
        'timestamp': timestamp
      })
      .then((response) => {
        console.log(response)
      })
      .catch((error) => {
        console.error(error)
      })
    },
    prepareVideo () {
      /* とりあえずここに書いて後から分離する */
      navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia
      var URL = window.URL || window.webkitURL
      /* eslint-disable no-unused-vars */
      var RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection
      var RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription
      var RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate
      var mediaC = {
        'mandatory': {
          'OfferToReceiveAudio': true,
          'OfferToReceiveVideo': true
        }
      }
      var iceConfig = {
        'iceServers': []
      }
      var qrcode = new Qrcode()

      function getVideoSources (callback) {
        if (!navigator.mediaDevices) {
          console.log('MediaStreamTrack')
          MediaStreamTrack.getSources(function (cams) {
            cams.forEach(function (c, i, a) {
              if (c.kind !== 'video') return
                callback({
                  name: c.facing,
                  id: c.id
                })
            })
          })
        } else {
          navigator.mediaDevices.enumerateDevices().then(function (cams) {
            cams.forEach(function (c, i, a) {
              console.log('mediaDevices', c)
                if (c.kind !== 'videoinput') return
                  callback({
                    name: c.label,
                    id: c.deviceId
                  })
            })
          })
        }
      }

      getVideoSources(function (cam) {
        main(cam.id)
      })

      var self = this
      function main (camId) {
        navigator.getUserMedia({
          audio: false,
          video: {
            optional: [
            {width: 100},
            {sourceId: camId}
            ]
          }
        }, function (stream) { // success
          console.log('Start Video', stream)
            var localStream = stream
            var video = document.getElementById('video')
            video.src = URL.createObjectURL(stream)
            video.play()
            console.log(video)
            video.volume = 0
            var stop = startReadQr(video, function (res) {
              stop()
              const resJson = JSON.parse(res)
              if (resJson.account && resJson.amount) {
                self.amount = Number(resJson.amount)
                self.receiver = resJson.account
              }
              console.log(res)
            })
        }, function (e) { // error
          console.error('Error on start video: ' + e.code)
        })
      }

      function startReadQr (video, cb) {
        var state = 'run'
        qrcode.callback = function (res) {
          console.log(res)
            /* eslint-disable no-extra-boolean-cast */
            if (!!res) {
              cb(res)
            }
        }

        var videoRead = function () {
          var w = video.videoWidth
          var h = video.videoHeight
          var canvas = document.createElement('canvas')
          console.log(canvas)
          canvas.width = w
          canvas.height = h
          var ctx = canvas.getContext('2d')

          var draw = function () {
            if (state === 'stop') {
              return
            }

            requestAnimationFrame(draw)

            ctx.drawImage(video, 0, 0, w, h)
            var data = canvas.toDataURL('image/png')
            qrcode.decode(data)
          }

          draw()
        }

        if (video.readyState === 0) {
          video.onloadedmetadata = videoRead
        } else {
          videoRead()
        }

        return function () {
          state = 'stop'
        }
      }
    }
  }
}

</script>

<!-- Add 'scoped' attribute to limit CSS to this component only -->
<style scoped>
.send-wrapper{
  height: 100%;
}

#video{
  height: 20%;
}
</style>
