/***
 * Recipe是酿造秘方的抽象, 不同得蜂蜜有不同的酿造酿方。
***/

const Redis = require("ioredis")
const logger = require("./cellar_logger")(require("path").basename(__filename))


class Recipe {
  constructor(msg_handler) {
    this.sub_url = process.argv[2]
    this.sub_channel = process.argv[3]
    this.pub_url = process.argv[4]
    this.pub_channel = process.argv[5]
    this.node_id = process.argv[6]
    this.node_type = process.argv[7]
    this.sub_client = null
    this.pub_client = null
    this.collector_meta_list = []

    this.msg_handler = msg_handler

    this.set_state(true, "init", "constructor start")

    // create Redis SUB Client
    try {
      this.sub_client = new Redis(this.sub_url)
    } catch (err) {
      this.set_state(false, "exit", "System Redis Sub Client create error")
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe class -> constructor",
          step: "create redis input SUB client",
          sub_url: this.sub_url,
          err: err,
        },
        "Redis sub client create errored"
      )
      process.exit(1)
    }

    // create Redis PUB Client
    try {
      this.pub_client = new Redis(this.pub_url)
    } catch (err) {
      this.set_state(false, "exit", "System Redis Pub Client create error")
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe class -> constructor",
          step: "create redis output PUB client",
          redis_url: this.pub_url,
          err: err,
        },
        "Redis pub connection error: "
      )
      process.exit(2)
    }

    process.on("stop", () => {
      this.stop()
      this.set_state(false, "exit", "Task Stop")
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe on stop message",
          step: "On stop message",
        },
        "Recipe stopped and will exit."
      )
      process.send("stopped")
      setTimeout(() => {
        logger.info(
          {
            node_id: this.node_id,
            node_type: this.node_type,
            func: "Recipe on stop message",
            step: "On stop message",
          },
          "Child Process exit(0)."
        )
        process.exit(0)
      }, 1000)
    })

    process.on("start", () => {
      this.start()
      this.set_state(true, "running", "Task Start")
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe on start message",
          step: "on start message",
        },
        "Recipe Started."
      )
    })

    process.on("uncaughtException", (err) => {
      this.stop()
      this.set_state(false, "exit", "uncaughtException")
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe class -> constructor",
          step: "On stop message",
          err: err,
        },
        "Get uncaughtException, exit."
      )
      process.exit(3)
    })

    // interface
    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)
    this.sendResult = this.sendResult.bind(this)
    this.sendError = this.sendError.bind(this)

    // helper
    this.messageHandlerWrapper = this.messageHandlerWrapper.bind(this)
    this.collect_meta_data = this.collect_meta_data.bind(this)
    this.save_meta_data = this.save_meta_data.bind(this)
    // this.update_last_act = this.update_last_act.bind(this)
    this.set_state = this.set_state.bind(this)

    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Recipe class -> constructor",
        step: "constructor",
      },
      "Recipe class loaded."
    )
  } // end of constructor

  start() {
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
        )
        process.exit(3)
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
        )
      }
    })

    this.sub_client.on("message", this.messageHandlerWrapper)

    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Recipe class -> start",
        step: "start",
      },
      "Brew thru Recipe start success."
    )
  } // end of start()

  stop() {
    if (this.sub_client) {
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
          )
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
          )
        }
      })
      this.sub_client.removeListener("message", this.messageHandlerWrapper)
      // safely quit the client and then exit the process
      Promise.all([
        this.sub_client.quit(),
      ])
        .then(() => {
          logger.info(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              func: "Recipe class -> stop",
              step: "redis sub_client quit",
            },
            "redis sub_clients quit success."
          )
        })
        .catch((error) => {
          logger.error(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              func: "Recipe class -> stop",
              step: "redis sub_client quit",
              error: error,
            },
            "redis sub_client quit failure."
          )
          this.sub_client.disconnect()
        })
    }

    if (this.pub_client) {
      Promise.all([
        this.pub_client.quit(),
      ])
        .then(() => {
          logger.info(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              func: "Recipe class -> stop",
              step: "redis pub_client quit",
            },
            "redis pub_client quit success."
          )
        })
        .catch((error) => {
          logger.error(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              func: "Recipe class -> stop",
              step: "redis pub_client quit",
              error: error,
            },
            "redis pub_client quit failure."
          )
          this.pub_client.disconnect()
        })
    }
  }

  // update_last_act(message) {
  //   // console.log('update_last_act', message)
  //   this.last_act.count++
  //   this.last_act.message = message
  //   let now = new Date()
  //   this.last_act.ts = now.getTime()
  // }

  sendResult(message) {
    let msg = this.collect_meta_data(message)
    if (msg === null) {
      // this.sendError(message, 'sendResult Error', new Error('Recipe Error in Single Line.'))
      return
    }

    try {
      this.pub_client.publish(this.pub_channel, JSON.stringify(msg))
    } catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe->sendResult",
          step: "pub_client.publish",
          err: err
        },
        "Recipe pub_client publish Errored."
      )
    }

    // this.update_last_act(JSON.stringify(msg))
  }

  sendError(message, info, error) {
    try {
      this.pub_client.publish(this.pub_channel, JSON.stringify({message: message, info: info, error: error}))
    } catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe->sendError",
          step: "pub_client.publish",
          err: err
        },
        "Recipe pub_client publish Errored."
      )
    }
  }

  collect_meta_data(message) {
    let meta = this.collector_meta_list.reduce((prev, curr) => {
      if (prev === null) {
        let json = {host: curr.host, source: curr.source, startTs: curr.startTs}
        return json
      }
      else {
        prev["endTs"] = curr.startTs
        return prev
      }
    }, null)

    let msg = null
    if (meta !== null) {
      if (meta["endTs"] !== undefined)
        meta["duration"] = meta["endTs"] - meta["startTs"]

      if (typeof(message) == "string") {
        try {
          message = JSON.parse(message)
        }
        catch (err) {
          logger.error(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              func: "Recipe->collect_meta_data",
              step: "JSON.parse",
              err: err
            },
            "Recipe collect_meta_data JSON.parse Errored."
          )
          // this.sendError(message, 'collectorMetaData', err)
        }
      }

      msg = {message: message, host: meta.host, startTs: meta.startTs}
      if (meta["endTs"] !== undefined) {
        msg["endTs"] = meta.endTs
        msg["duration"] = meta.duration
      }
    }
    this.collector_meta_list = []
    return msg
  }

  save_meta_data(channel, message) {
    let now = new Date()
    try {
      let json = JSON.parse(message)
      let meta = {host: json.host, source: channel, startTs: now.getTime()}

      this.collector_meta_list.push(meta)

      return json.msg
    }
    catch(err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe->save_meta_data",
          step: "JSON.parse",
          err: err
        },
        "save_meta_data JSON.parse Error:"
      )
      return message
    }
  }

  messageHandlerWrapper(channel, message) {

    let msg = this.save_meta_data(channel, message)
    try {
      this.msg_handler(this, msg)
    }
    catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Recipe->messageHandlerWrapper",
          step: "msg_handler Exception",
          err: err
        },
        "messageHandlerWrapper->msg_handler Exception:"
      )
      // this.sendError(message, "messageHandlerWrapper", new Error("msg_handler Error"))
    }
  }

  set_state(health, state, summary) {
    this.health = health
    this.state = state
    this.summary = summary
  } // end of set_status

}

module.exports = Recipe
