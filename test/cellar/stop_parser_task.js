const Redis = require("ioredis")
require("dotenv").config()

// Passive Collection Task
let task = {
  id: "parser-stop-task-0",
  node_id: "cellar-987654321",
  name: "Parser Task",
  scope: "task",
  type: "parser",
  action: "stop",
  task_id_for_stop: "parser-task-0",
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

const redis = new Redis(process.env.SINGED_REDIS_URL)

task.task_id_for_stop = process.argv[2] || "parser-start-task-0"
redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(task))
console.log(`task: ${task.task_id_for_stop} need to stop`)

redis.quit()
