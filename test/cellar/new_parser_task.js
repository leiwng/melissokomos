const Redis = require("ioredis")
require("dotenv").config()

// Parser Task Template
const template = {
  id: "parser-start-task-1",
  name: "Parser Start Task",
  scope: "task",
  type: "parser",
  action: "start",
  desc: "Parser Task",
  recipe: "D:\\Prj\\github\\melissokomos\\cellar\\recipes\\recipe4mbank5_app_log.js",
  in: {
    redis_url: "redis://192.168.0.77:6379/0",
    redis_sub_ch: "mbank50-app-log-host77-0",
  },
  out: {
    redis_url: "redis://192.168.0.77:6379/0",
    redis_pub_ch: "mbank50-app-log-host77-0-parser"
  }
}

// passive collector : 2
let task1 = Object.assign({}, template)
task1.id = "p_001"
task1.in.redis_sub_ch = "pc_001"
task1.out.redis_pub_ch = "p_001-pc_001"

let task2 = Object.assign({}, template)
task2.id = "p_002"
task2.in.redis_sub_ch = "pc_002"
task2.out.redis_pub_ch = "p_002-pc_002"

// active collector : 3
let task3 = Object.assign({}, template)
task3.id = "p_003"
task3.in.redis_sub_ch = "ac_001"
task3.out.redis_pub_ch = "p_003-ac_001"

let task4 = Object.assign({}, template)
task4.id = "p_004"
task4.in.redis_sub_ch = "ac_002"
task4.out.redis_pub_ch = "p_004-ac_002"

let task5 = Object.assign({}, template)
task5.id = "p_005"
task5.in.redis_sub_ch = "ac_003"
task5.out.redis_pub_ch = "p_005-ac_003"

// agent collector : 2
let task6 = Object.assign({}, template)
task6.id = "p_006"
task6.in.redis_sub_ch = "agc_001"
task6.out.redis_pub_ch = "p_006-agc_001"

let task7 = Object.assign({}, template)
task7.id = "p_007"
task7.in.redis_sub_ch = "agc_002"
task7.out.redis_pub_ch = "p_007-agc_002"

const redis = new Redis(process.env.SINGED_REDIS_URL)

let tasks = [task1, task2, task3, task4, task5, task6, task7]
for (let i = 0; i < tasks.length; i++) {
  console.log(tasks[i].out.redis_pub_ch)
  redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(tasks[i]))
}

redis.quit()
