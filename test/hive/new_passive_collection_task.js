const Redis = require("ioredis")
require("dotenv").config()

// Passive Collection Task Template
const template = {
  id: "1",
  name: "Passive Collection Task",
  scope: "task",
  type: "passive",
  action: "start",
  desc: "Passive Collection",
  in: {
    ssh_host: "192.168.0.77",
    ssh_port: 22,
    ssh_user: "voyager",
    ssh_pass: "welcome1",
    encoding: "utf8",
    shell_cmd: "tail -F /demo/labTab/AIOpsDemo/log_data/dst_mbank.4.log",
  },
  out: {
    redis_url: "redis://192.168.0.77:6379/0",
    redis_pub_ch: "mbank50-app-log-host77"
  }
}

let task1 = Object.assign({}, template)
task1.id = "pc_001"
task1.out.redis_pub_ch = "pc_001"

let task2 = Object.assign({}, template)
task2.id = "pc_002"
task2.out.redis_pub_ch = "pc_002"

let tasks = [task1, task2]
const redis = new Redis(process.env.SINGED_REDIS_URL)

for (let i = 0; i < tasks.length; i++) {
  console.log(tasks[i].out.redis_pub_ch)
  redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(tasks[i]))
}

redis.quit()
