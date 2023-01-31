const Redis = require("ioredis");
require('dotenv').config()

// Passive Collection Task
let task = {
  id: "task-limit-1",
  name: "Chg Task Limit Task",
  node_id: process.env.SINGED_NODE_ID,
  scope: "node",
  type: "",
  action: "chg_task_limit",
  desc: "Chg Task Limit",
  task_limit: 10
}

loop_cnt = process.argv[2] || 7;
for (let i = 0; i < loop_cnt; i++) {
  task.id = `task-${i}`;
  task.name = `Passive Collection ${task.id}}`;
  task.out.redis_pub_ch = `mbank50-app-log-host77-${i}`;
  redis = new Redis(process.env.SINGED_REDIS_URL);
  redis.rpush(process.env.SINGED_TASK_REQ_QUEUE, JSON.stringify(task));
}

// redis.disconnect();
