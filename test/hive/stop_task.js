const Redis = require("ioredis")
require("dotenv").config()

const node_id = process.argv[2] || "cellar-987654321"
const task_id = process.argv[3] || "cellar-task-0"

// Passive Collection Task
let task = {
    id: task_id,
    name: `Stop Task ${task_id}`,
    node_id: node_id,
    scope: "task",
    type: "",
    action: "stop",
    desc: `Stop Task ${task_id}`,
}

const redis = new Redis(process.env.SINGED_REDIS_URL)
redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(task))

// redis.quit();
