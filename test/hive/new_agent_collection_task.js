const Redis = require("ioredis")
require("dotenv").config()

// Agent Collection Task Template
const template = {
  id: "agc_001",
  name: "Agent Collection Start Task",
  scope: "task",
  type: "agent",
  action: "start",
  desc: "Agent Task",
  in: {
    redis_url: "redis://192.168.0.77:6379/0",
    redis_sub_ch: "src_agc_001",
    encoding: "utf-8",
    parameter: "source log file filter string, refer to filebeat config file"
  },
  out: {
    redis_url: "redis://192.168.0.77:6379/0",
    redis_pub_ch: "agc_001"
  }
}

let task1 = JSON.parse(JSON.stringify(template))
task1.id = "agc_001"
task1.in.redis_sub_ch = "src_agc_001"
task1.in.parameter = "/demo/labTab/AIOpsDemo/log_data/*_1dst_mbank.4.log"
task1.out.redis_pub_ch = "agc_001"

let task2 = JSON.parse(JSON.stringify(template))
task2.id = "agc_002"
task2.in.redis_sub_ch = "src_agc_002"
task2.in.parameter = "/demo/labTab/AIOpsDemo/log_data/short_*_1mbank.4.log"
task2.out.redis_pub_ch = "agc_002"

const redis = new Redis(process.env.SINGED_REDIS_URL)

let tasks = [task1, task2]

for (let i = 0; i < tasks.length; i++) {
  console.log(tasks[i].out.redis_pub_ch)
  redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(tasks[i]))
}

redis.quit()
