const Redis = require("ioredis")
require("dotenv").config()

// Passive Collection Task
let task = {
  id: "task-limit-2",
  name: "Chg Task Limit Task",
  node_id: process.env.SINGED_NODE_ID,
  scope: "node",
  type: "",
  action: "chg_task_limit",
  desc: "Chg Task Limit",
  task_limit: 9
}

const redis = new Redis(process.env.SINGED_REDIS_URL)
redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(task))

redis.quit();
