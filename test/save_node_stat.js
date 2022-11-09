const Redis = require("ioredis");
const redis = new Redis("redis://127.0.0.1:6379/")

const node_stat_table_name = "node_stat_01"
const node_id = "node_01"
const task_queue_name = "task_queue_01"
const task_chg_req_channel_name = "task_chg_req_01"
const task_chg_rsp_channel_name = "task_chg_rsp_01"

function update_node_stat(node_id, node_stat, bees) {

  // 更新node_stat中的node信息
  node_stat.NODE_ID = node_id
  node_stat.UPTIME = 1234567
  this.uptime = node_stat.UPTIME
  node_stat.TASK_LIMIT = 5
  node_stat.TASK_COUNT = 4
  node_stat.REDIS_URL = "redis://127.0.0.1:6379/"
  node_stat.TASK_QUEUE = "SINGED_TASK_QUEUE"
  node_stat.TASK_CHG_REQ_CHANNEL = 'SINGED_TASK_CHG_REQ'
  node_stat.TASK_CHG_RES_CHANNEL = 'SINGED_TASK_CHG_RES'
  node_stat.TASK_STAT_TABLE = 'SINGED_TASK_STAT'
  node_stat.NODE_STAT_TABLE = 'SINGED_NODE_STAT'

  // 更新node_stat中的task信息
  if (this.bees.length > 0) {
    node_stat.TASK_LIST = this.bees.map((bee) => {
      return {
        ID: bee.task.TASKID,
        TYPE: bee.task.TYPE,
        NAME: bee.task.NAME,
        DESC: bee.task.DESC,

        INPUT: bee.task.INPUT,
        OUTPUT: bee.task.OUTPUT,

        STATE: bee.ssh_status,
        STATE_DESC: bee.ssh_status,
        UPTIME: bee.uptime,
        WORK_COUNT: bee.line_counter,
      };
    });
  } else {
    node_stat.TASK_LIST = [];
  }

  // 把node_stat更新到node_stat_table
  this.redis.hset(
    this.node_stat_table_name,
    this.node_id,
    JSON.stringify(node_stat),
    (err, res) => {
      if (err) {
        logger.error(
          {
            node_id: this.node_id,
            node_stat_table_name: this.node_stat_table_name,
            func: "Hive->update_node_stat",
            step: "更新node_stat失败.",
            err: err
          },
          "更新node_stat失败."
        );
      } else {
        logger.info(
          {
            node_id: this.node_id,
            node_stat_table_name: this.node_stat_table_name,
            func: "Hive->update_node_stat",
            step: "更新node_stat成功.",
            node_stat: node_stat
          },
          "更新node_stat成功."
        );
      }
    }
  );
} // end of update_node_stat
