const Redis = require("ioredis");
const redis = new Redis("redis://127.0.0.1:6379/")

const node_stat_table_name = "node_stat_01"
const node_id = "node_01"
const task_queue_name = "task_queue_01"
const task_chg_req_channel_name = "task_chg_req_01"
const task_chg_rsp_channel_name = "task_chg_rsp_01"

