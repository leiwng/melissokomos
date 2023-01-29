// Recipe framework, base for all recipes

const Redis = require("ioredis");


class Recipe {
  constructor(msg_handler) {
    this.redis_url = process.argv[2]
    this.sub_channel = process.argv[5]
    this.sub_type = process.argv[6]
    this.pub_channel = process.argv[7]
    this.pub_type = process.argv[8]
    this.custom_args = process.argv[9]

    this.msg_handler = msg_handler

    // create Redis SUB Client
    try {
      this.sub_client = new Redis(this.redis_url);
    } catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe class -> constructor",
          step: "create redis SUB client",
          redis_url: this.redis_url,
          err: err,
        },
        "Redis connection error: "
      );
      process.exit(1);
    }

    // create Redis PUB Client
    try {
      this.pub_client = new Redis(this.redis_url);
    } catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe class -> constructor",
          step: "create redis PUB client",
          redis_url: this.redis_url,
          err: err,
        },
        "Redis connection error: "
      );
      process.exit(2);
    }

    this.last_act = {count: 0, message: ''}

    this.collector_meta_list = []

    process.on('message', message => {
      if (message.GET === 'last_act')
        process.send(this.last_act)
    })

    process.on('disconnect', () => {
      console.log('Recipe disconnected, exiting...')
      this.sub_client.disconnect()
      this.pub_client.disconnect()
      process.exit()
    })

    // interface
    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)
    this.sendResult = this.sendResult.bind(this)
    this.sendError = this.sendError.bind(this)

    // helper
    this.updateLastActivity = this.updateLastActivity.bind(this)
    this.messageHandlerWrapper = this.messageHandlerWrapper.bind(this)
    this.collect_meta_data = this.collect_meta_data.bind(this)
    this.storeMetaData = this.storeMetaData.bind(this)
  } // end of constructor

  start() {
    let that = this
    this.sub_client.subscribe(this.sub_channel, (err, count) => {
      if (err) {
        logger.error(
          {
            node_id: this.node_id,
            node_type: this.node_type,
            func: "Recipe class -> start",
            step: "subscribe to channel",
            channel: this.sub_channel,
            err: err,
          },
          "Redis subscribe error: "
        );
        process.exit(3);
      } else {
        logger.info(
          {
            node_id: this.node_id,
            node_type: this.node_type,
            func: "Recipe class -> start",
            step: "subscribe to channel",
            channel: this.sub_channel,
            count: count,
          },
          "Redis subscribe success: "
        );
      }
    });
    this.sub_client.on("message", this.messageHandlerWrapper);
  } // end of start()

  stop() {
    this.sub_client.unsubscribe(this.sub_channel, (err, count) => {
      if (err) {
        logger.error(
          {
            node_id: this.node_id,
            node_type: this.node_type,
            func: "Recipe class -> stop",
            step: "unsubscribe from channel",
            channel: this.sub_channel,
            err: err,
          },
          "Redis unsubscribe error: "
        );
        process.exit(4);
      } else {
        logger.info(
          {
            node_id: this.node_id,
            node_type: this.node_type,
            func: "Recipe class -> stop",
            step: "unsubscribe from channel",
            channel: this.sub_channel,
            count: count,
          },
          "Redis unsubscribe success: "
        );
      }
    });
    this.sub_client.removeListener("message", this.messageHandlerWrapper);
  } // end of stop()

  updateLastActivity(message) {
    // console.log('updateLastActivity', message)
    this.last_act.count++
    this.last_act.message = message
    let now = new Date()
    this.last_act.ts = now.getTime()
  }

  sendResult(message) {
    let msg = this.collect_meta_data(message)
    if (msg === null) {
      // this.sendError(message, 'sendResult Error', new Error('Recipe Error in Single Line.'))
      return
    }

    try {
      this.pub_client.publish(this.pub_channel, JSON.stringify(msg))
    } catch(err) {
      console.log('Recipe.js', 'sendResult Error', err)
    }

    this.updateLastActivity(JSON.stringify(msg))
  }

  sendError(message, info, error) {
    try {
      this.pub_client.publish(this.pub_channel, JSON.stringify({message: message, info: info, error: error}))
    } catch (err) {
      console.log('Recipe.js', 'sendError Error', err)
    }
  }

  collect_meta_data(message) {
    let meta = this.collector_meta_list.reduce((prev, curr) => {
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
          // this.sendError(message, 'collectorMetaData', err)
        }
      }

      msg = {message: message, host: meta.host, startTs: meta.startTs}
      if (meta['endTs'] !== undefined) {
        msg['endTs'] = meta.endTs
        msg['duration'] = meta.duration
      }
    }
    this.collector_meta_list = []
    return msg
  }

  storeMetaData(channel, message) {
    let now = new Date()
    try {
      let json = JSON.parse(message)
      let meta = {host: json.host, source: channel, startTs: now.getTime()}

      this.collector_meta_list.push(meta)

      return json.msg
    }
    catch(err) {
      // console.log(err)
      return message
    }
  }

  messageHandlerWrapper(channel, message) {

    let msg = this.storeMetaData(channel, message)
    try {
      this.msg_handler(this, channel, msg)
    }
    catch(err) {
      console.log('messageHandlerWrapper Error', err, message)
      this.sendError(message, 'messageHandlerWrapper', new Error('msg_handler Error'))
    }
  }
}

export default Recipe
