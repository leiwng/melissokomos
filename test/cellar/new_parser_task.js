const Redis = require("ioredis")
require("dotenv").config()

// Passive Collection Task
let task = {
    id: "1",
    name: "Parser Task",
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

const redis = new Redis(process.env.SINGED_REDIS_URL)

const loop_cnt = process.argv[2] || 1
for (let i = 0; i < 1; i++) {
    task.id = `parser-task-${i}`
    task.name = `Parser Task: ${task.id}`
    task.in.redis_sub_ch = `mbank50-app-log-host77-${i}`
    task.out.redis_pub_ch = `mbank50-app-log-host77-${i}-parser`
    console.log(task.out.redis_pub_ch)
    redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(task))
}

redis.quit()
