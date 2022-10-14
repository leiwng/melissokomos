const { fork } = require('node:child_process');
const Redis = require("ioredis");

class Brewer {

  constructor(msg_handler) {

    this.msg_handler = msg_handler

    this.sub_url = process.argv[2]
    this.sub_channel = process.argv[3]
    this.pub_url = process.argv[4]
    this.pub_channel = process.argv[5]

    this.sub = new Redis(this.sub_url)
    this.pub = new Redis(this.pub_url)

    this.meta_list = []

    process.on('message', (msg) => {
      if (msg === 'exit') {
        console.log('Brewer exit')
        this.sub.unsubscribe(this.sub_channel)
        this.sub.disconnect()
        this.pub.disconnect()
        process.exit()
      }
    });
  }

  start() {
    this.sub.subscribe(this.sub_channel, (err, count) => {
      if (err) {
        console.log(err)
      } else {
        console.log('Subscribed successfully! Brewer subscribed to ' + this.sub_channel)
      }
    });

    this.sub.on('message', (channel, message) => {
      this.msg_handler_wrapper(channel, message)
    });
  }

  send_result(message) {

    let msg = this.collect_meta_data(message)

    if (msg === undefined || msg === null) {
      // this.send_err(message, 'send_result Error', new Error('Parser Error in Single Line.'))
      return
    }

    try {

      this.pub.publish(this.pub_channel, JSON.stringify(msg))

    }
    catch(err) {
      console.log('brewer.js', 'send_result Error', err)
    }
  }

  send_err(message, info, error) {
    try {
      switch (this.pubType) {
        case 'Redis PubSub':
        this.pubClient.publish(constants.PARSER_ERROR_PREFIX + this.pubChannel, JSON.stringify({message: message, info: info, error: error}))
        break

        case 'Nsq Queue':
        let urlJson = url.parse(this.nsqdUrl, false, true)
        let req = http.request({
          ...urlJson,
          path: '/pub?topic=' + constants.PARSER_ERROR_PREFIX + this.pubChannel,
          headers: { 'Connection': 'keep-alive' },
          method: 'POST',
        }, res => {
          let data = ''

          res.on('data', chunk => {
            data += chunk
          })

          res.on('end', () => {
            // do nothing
          })
        })

        req.on('error', err => {
          console.log('Parser Error', err)
        })

        req.write(JSON.stringify({message: message, info: info, error: error}))
        req.end()
        break

        default:
        this.pubClient.publish(constants.PARSER_ERROR_PREFIX + this.pubChannel, JSON.stringify({message: message, info: info, error: error}))
        break
      }
    }
    catch(ex) {
      console.log('Parser.js', 'send_err Error', ex)
    }
  }

  collect_meta_data(message) {
    let meta = this.meta_list.reduce((prev, curr) => {
      if (prev === null) {
        let json = {host: curr.host, source: curr.source, startTs: curr.startTs}
        return json
      }
      else {
        prev['endTs'] = curr.startTs
        return prev
      }
    }, null)

    let msg = null
    if (meta !== null) {
      if (meta['endTs'] !== undefined)
        meta['duration'] = meta['endTs'] - meta['startTs']

      if (typeof(message) == 'string' || typeof(message) == 'String') {
        try {
          message = JSON.parse(message)
        }
        catch(err) {
          console.log('collect_meta_data Error', err)
          // this.send_err(message, 'collectorMetaData', err)
        }
      }

      msg = {message: message, host: meta.host, startTs: meta.startTs}
      if (meta['endTs'] !== undefined) {
        msg['endTs'] = meta.endTs
        msg['duration'] = meta.duration
      }
    }
    this.meta_list = []
    return msg
  }

  store_meta_data(channel, message) {
    let now = new Date()
    try {
      let json = JSON.parse(message)
      let meta = {host: json.host, source: channel, startTs: now.getTime()}

      this.meta_list.push(meta)

      return json.msg
    }
    catch(err) {
      // console.log(err)
      return message
    }
  }

  msg_handler_wrapper(channel, message) {

    let msg = this.store_meta_data(channel, message)
    try {
      this.msg_handler(this, channel, msg)
    }
    catch(err) {
      console.log('msg_handler_wrapper Error', err, message)
      this.send_err(message, 'msg_handler_wrapper', new Error('msg_handler Error'))
    }
  }
}