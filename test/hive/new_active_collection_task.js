const Redis = require("ioredis")
require("dotenv").config()


function zfill(num, width) {
  const str = num.toString()
  const diff = width - str.length
  return diff > 0 ? "0".repeat(diff) + str : str
}

// Active Collection Task Template
const template = {
  id: "ac_001",
  name: "Active Collection Task",
  scope: "task",
  type: "active",
  action: "start",
  desc: "Active Collection",
  in: {
    ssh_host: "192.168.0.77",
    ssh_port: 22,
    ssh_user: "voyager",
    ssh_pass: "welcome1",
    encoding: "utf8",
    shell_cmd: "cat /demo/labTab/AIOpsDemo/log_data/short_dst_mbank.4.log",
    exec_type: "interval",
    trigger: "00:00:50"
  },
  out: {
    redis_url: "redis://192.168.0.77:6379/0",
    redis_pub_ch: "ac_001"
  }
}


let task01 = JSON.parse(JSON.stringify(template))
task01.id = "ac_001"
task01.in.exec_type = "interval"
task01.in.trigger = "00:03:00"
task01.out.redis_pub_ch = "ac_001"

let task02 = JSON.parse(JSON.stringify(template))
task02.id = "ac_002"
task02.in.exec_type = "on_time"
const dt = new Date(new Date().getTime() + 30000) // current time + 30 seconds
task02.in.trigger = `${zfill(dt.getHours(), 2)}:${zfill(dt.getMinutes(), 2)}:${zfill(dt.getSeconds(), 2)}`
task02.out.redis_pub_ch = "ac_002"

let task03 = JSON.parse(JSON.stringify(template))
task03.id = "ac_003"
task03.in.exec_type = "one_shot"
task03.in.trigger = "00:00:00"
task03.out.redis_pub_ch = "ac_003"

let tasks = [task01, task02, task03]
const redis = new Redis(process.env.SINGED_REDIS_URL)
for (let i = 0; i < tasks.length; i++) {
  console.log(tasks[i].out.redis_pub_ch)
  redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(tasks[i]))
}

redis.quit()
