/***
Masonbee, the agent bee, which get pollen from 3rd party, like filebeat.
The Ground Truth:
1. The JSON format of filebeat output to pub/sub channel is:
{
  "@timestamp": "2023-02-28T15:04:33.561Z",
  "@metadata": {
    "beat": "",
    "type": "doc",
    "version": "6.2.3"
  }
  "prospector": {
    "type": "log"
  },
  "beat": {
    "name": "node4",
    "hostname": "node4",
    "version": "6.2.3"
  },
  "source": "/opt/sshfs-WangYinNew01/172.16.3.1/logFile.2023-02-28.log",
  "offset": 334394422,
  "message": "\\u003cCnsmSysSvrId\\u003e04\\u003c/CnsmSysSvrId\\u003e\"
}
2. The JSON format of Masonbee output to pub/sub channel is:
{
  "startTs": 1677567438569,
  "msg": {
    "@timestamp": "2023-02-28T15:04:33.561Z",
    "@metadata": {
      "beat": "",
      "type": "doc",
      "version": "6.2.3"
    }
    "prospector": {
      "type": "log"
    },
    "beat": {
      "name": "node4",
      "hostname": "node4",
      "version": "6.2.3"
    },
    "source": "/opt/sshfs-WangYinNew01/172.16.3.1/logFile.2023-02-28.log",
    "offset": 334394422,
    "message": "\\u003cCnsmSysSvrId\\u003e04\\u003c/CnsmSysSvrId\\u003e\"
  }
}
Actually, this message just add "startTs" property and pack all message data from filebeat into "msg" property.
3. The JSON message from filebeat have all systems log files new lines, which can be distinguished from "source" property.
4. Use minimatch(https://www.npmjs.com/package/minimatch) to match the "source" property to right system's masonbee, and masonbee route right message to right channel which will handled by right brewer.
minimatch('bar.foo', '*.foo') // true!
minimatch('bar.foo', '*.bar') // false!

***/

const Redis = require("ioredis")
const { minimatch } = require("minimatch")
const logger = require("./hive_logger")(require("path").basename(__filename))


class Masonbee {
  constructor(task, node_id, node_type) {

    // member function
    this.init = this.init.bind(this)
    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)

    // 根据Task参数初始化对象属性
    this.init(task, node_id, node_type)

    if (this.health === false) {
      return
    }

    // Start Task
    this.start()

  } // end of constructor

  init(task, node_id, node_type) {

    this.set_state(true, "running", "init")
    this.task = task
    this.node_id = node_id
    this.node_type = node_type

    this.id = task.id
    this.action = task.action
    this.name = task.name
    this.desc = task.desc

    this.sub_url = task.in.redis_url
    this.sub_channel = task.in.redis_sub_ch
    this.sub_encoding = task.in.encoding
    this.sub_log_filter_str = task.in.parameter

    this.pub_url = task.out.redis_url
    this.pub_channel = task.out.redis_pub_ch

    this.start_ts = Date.now()
    this.uptime = 0

    this.sub = null
    this.pub = null

    try {
      this.sub = new Redis(this.sub_url)
    } catch (err) {
      this.set_state(false, "error", "Create Redis SUB Client Error")
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          redis_url: this.sub_url,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        "Masonbee, Create Redis SUB Client failed."
      )
      return
    }

    try {
      this.pub = new Redis(this.pub_url)
    } catch (err) {
      this.set_state(false, "error", "Create Redis PUB Client Error")
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          redis_url: this.pub_url,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        "Masonbee, Create Redis PUB Client failed."
      )
      return
    }

    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
      },
      "Masonbee, init finished"
    )
  } // end of init

  sub_on_message(channel, message) {
    let msg_json = JSON.parse(message)

    if (minimatch(msg_json.source, this.sub_log_filter_str)) {
      let now = new Date()
      let new_msg = JSON.stringify({startTs: now.getTime(), msg: msg_json})
      this.pub.publish(this.pub_channel, new_msg)
    }
  }

  start() {
    this.sub.on("message", this.sub_on_message.bind(this))
    this.sub.subscribe(this.sub_channel)

    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
      },
      "Masonbee, Started."
    )
  } // end of start

  stop() {
    this.sub.unsubscribe(this.sub_channel)
    this.sub.quit()
    this.pub.quit()

    this.set_state(false, "stopped", "ssh_end")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
      },
      "Masonbee, stopped."
    )
  } // end of stop

  set_state(health, state, ssh_state) {
    this.ssh_state = ssh_state
    this.health = health
    this.state = state
  } // end of set_status

} // end of class Masonbee

module.exports = Masonbee