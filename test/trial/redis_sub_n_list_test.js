const Redis = require("ioredis")
const logger = require("./redis_sub_n_list_logger")

const redis = new Redis("redis://127.0.0.1:6379/")

const node_stat_table_name = "node_stat_01"
const node_id = "node_01"
// const task_queue_name = "task_queue_01"
const task_chg_req_channel_name = "task_chg_req_01"
const task_chg_rsp_channel_name = "task_chg_rsp_01"

redis.exists(node_stat_table_name).then(res => {
  if (res == 1) {
    redis.hget(node_stat_table_name, node_id, (err, res) => {
      if (err) {
        logger.error(
          {
            stage: "查看node_stat",
            node_id: node_id,
            node_stat_table_name: node_stat_table_name,
            err: err
          },
          "redis node 状态hash表中找不到node_id对应的node_stat."
        )
      } else {
        logger.info(
          {
            stage: "查看node_stat",
            node_id: node_id,
            node_stat_table_name: node_stat_table_name,
            node_stat: res
          },
          "redisnode 状态hash表中找到node_id对应的node_stat."
        )
      }
    })
  } else {
    logger.error(
      {
        stage: "查看node_stat",
        node_id: node_id,
        node_stat_table_name: node_stat_table_name,
        res: res
      },
      "redis中找不到保存node_stat的Key."
    )
  }
})

// const chk_task_interval = setInterval( () => {
//   redis.lpop(task_queue_name, 0, (err, res) => {
//   if (err) {
//     logger.error(
//     {
//       stage: "检查 Task",
//       node_id: node_id,
//       task_queue_name: task_queue_name,
//       err: err
//     },
//     "listen to task-queue fail (task_queue_name)."
//     )
//   } else {
//     // 从 Task队列中get 出 Task
//     const task = JSON.parse(res[1])
//     logger.info(
//     {
//       stage: "检查 Task",
//       node_id: node_id,
//       task_queue_name: task_queue_name,
//       task: task
//     },
//     "从 Task队列中get 出 Task."
//     )
//   }
//   })
// }, 1000)

const redis_sub = redis.duplicate()
const redis_pub = redis.duplicate()

redis_sub.subscribe("task_chg_req_channel_name", (err, count) => {
  if (err) {
    logger.error(
      {
        stage: "订阅 Task变更请求",
        task_chg_req_channel_name: task_chg_req_channel_name,
        err: err
      },
      "订阅频道fail ."
    )
  } else {
    logger.info(
      {
        stage: "订阅 Task变更请求",
        task_chg_req_channel_name: task_chg_req_channel_name,
        count: count
      },
      "订阅频道Success."
    )
  }
})

redis_sub.on("message", (channel, message) => {
  logger.info(
    {
      stage: " Task变更请求到达",
      channel: channel,
      message: message
    },
    "收到消息."
  )
  const pub_msg = {
    node_id: node_id,
    task_chg_req: JSON.parse(message),
    channel: channel
  }
  redis_pub.publish(task_chg_rsp_channel_name, JSON.stringify(pub_msg), (err, count) => {
    if (err) {
      logger.error(
        {
          stage: "发布 Task变更响应",
          task_chg_rsp_channel_name: task_chg_rsp_channel_name,
          err: err
        },
        "发布消息fail ."
      )
    } else {
      logger.info(
        {
          stage: "发布 Task变更响应",
          task_chg_rsp_channel_name: task_chg_rsp_channel_name,
          count: count
        },
        "发布消息Success."
      )
    }
  })
})
