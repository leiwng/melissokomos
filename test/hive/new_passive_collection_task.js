const Redis = require("ioredis")
require("dotenv").config()

// Passive Collection Task
let task = {
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

const redis = new Redis(process.env.SINGED_REDIS_URL)

const loop_cnt = process.argv[2] || 3
for (let i = 0; i < loop_cnt; i++) {
    task.id = `passive-collector-task-${i}`
    task.name = `Passive Collection ${task.id}`
    task.out.redis_pub_ch = `mbank50-app-log-host77-${i}`
    console.log(task.out.redis_pub_ch)
    redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(task))
}

redis.quit()
