/*
  This script simulates the behavior of filebeat, which reads log files and sends the log messages to Redis.
  GROUND TRUTH:
    PC-output: { host: this.ssh_host, startTs: now.getTime(), msg: line of log file }
    filebeat-output: {
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
    AGC-output: {startTs: now.getTime(), msg: msg_json}
*/

const Redis = require("ioredis")
require("dotenv").config()

const sub_client = new Redis(process.env.SINGED_REDIS_URL)
const pub_client = new Redis(process.env.SINGED_REDIS_URL)

const data_in_ch1 = "pc_001"
const date_out_ch1 = "src_agc_001"

const data_in_ch2 = "pc_002"
const date_out_ch2 = "src_agc_002"

// Ctrl+C to Exit
process.on("SIGINT", () => {
  sub_client.quit()
  pub_client.quit()
  process.exit(0)
})

sub_client.on("message", (channel, message) => {

  let msg_json = JSON.parse(message)

  // fake Passive Collector output message to filebeat output message
  const filebeat_msg_template = {
    "@timestamp": "2023-02-28T15:04:33.561Z",
    "@metadata": {
      "beat": "",
      "type": "doc",
      "version": "6.2.3"
    },
    "prospector": {
      "type": "log"
    },
    "beat": {
      "name": "node4",
      "hostname": "node4",
      "version": "6.2.3"
    },
    "source": "/demo/labTab/AIOpsDemo/log_data/short_1dst_mbank.4.log",
    "offset": 334394422,
    "message": "\\u003cCnsmSysSvrId\\u003e04\\u003c/CnsmSysSvrId\\u003e\""
  }

  let fb_msg = JSON.parse(JSON.stringify(filebeat_msg_template))
  fb_msg["@timestamp"] = msg_json.startTs
  fb_msg.message = msg_json.msg

  switch (channel) {
    case data_in_ch1:
      fb_msg.source = "/demo/labTab/AIOpsDemo/log_data/short_1dst_mbank.4.log"

      pub_client.publish(date_out_ch1, JSON.stringify(fb_msg))
      break
    case data_in_ch2:
      fb_msg.source = "/demo/labTab/AIOpsDemo/log_data/short_dst_1mbank.4.log"

      pub_client.publish(date_out_ch2, JSON.stringify(fb_msg))
      break
    default:
      console.log("Received data from unknown channel: " + channel)
  }

})

sub_client.subscribe(data_in_ch1, data_in_ch2, (err, count) => {
  if (err) {
    console.log("Error subscribing to channels: " + err)
    process.exit(1)
  } else {
    console.log("Subscribed to " + count + " channels")
  }
})