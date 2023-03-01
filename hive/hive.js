/***
 * Hive 蜂房, 驱赶Bee去采集花粉。Bee根据不同的种类对应不同的采集方式。
 * Bumblebee 轰炸蜂, 被动采集, 通过 ssh 通道从远程目标机上tail日志文件获get 花粉。
 * Cuckoobee 喜鹊蜂, 主动采集, 通过 ssh 通道从远程目标机上执行 shell script 获get 花粉。
 * Masonbee 砖工蜂, 代理采集, 通过直接从第三方获get 花粉。
***/
const Redis = require("ioredis")
const Bee = require("./bee")
const logger = require("./hive_logger")(require("path").basename(__filename))
require("dotenv").config()


class Hive {
  constructor() {
    // member functions
    this.init = this.init.bind(this)

    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)
    this.stop_bee = this.stop_bee.bind(this)

    this.chk_new_task = this.chk_new_task.bind(this)
    this.resume_tasks = this.resume_tasks.bind(this)
    this.update_node_stat = this.update_node_stat.bind(this)
    this.update_task_result = this.update_task_result.bind(this)

    this.get_node_stat = this.get_node_stat.bind(this)
    this.get_tasks_from_node_stat = this.get_tasks_from_node_stat.bind(this)

    this.log_info = this.log_info.bind(this)
    this.log_err = this.log_err.bind(this)

    // constructor operations
    this.init()
    this.get_node_stat()
    this.get_tasks_from_node_stat()
    this.resume_tasks()
  }

  init() {
    // node type , hive or cellar
    this.node_type = "hive"
    // 从env中获get 运行的基础设施和基本标识信息
    this.node_id = process.env.SINGED_NODE_ID
    //  Task数上限, 超过此数值, 不再接受New  Task
    this.task_limit = process.env.SINGED_TASK_LIMIT
    // Redis服务访问点
    this.redis_url = process.env.SINGED_REDIS_URL

    //  Task下达队列
    this.task_req_queue = process.env.SINGED_TASK_REQ_QUEUE
    //  Task返回队列
    this.task_rsp_queue = process.env.SINGED_TASK_RSP_QUEUE

    // node 状态 Task Update 表
    this.node_stat_hset = process.env.SINGED_NODE_STAT_HSET

    // 检查New  Task的时间间隔(毫秒)
    this.chk_new_task_interval_ms = process.env.SINGED_CHK_NEW_TASK_INTERVAL_MS
    //  Update node 状态的时间间隔(毫秒)
    this.node_stat_update_interval_ms = process.env.SINGED_NODE_STAT_UPDATE_INTERVAL_MS

    this.node_stat = {}
    this.node_tasks = []
    this.bees = []
    this.task_count = 0

    this.chk_task_interval = null
    this.update_node_stat_interval = null

    // node 开始时间戳
    this.start_ts = Date.now()
    // node 上线持续时间
    this.uptime = 0

    // create Redis Client
    try {
      this.redis = new Redis(this.redis_url)
    } catch (err) {
      this.log_err("Hive init", "New Redis Client", this.redis_url, err, "Redis connection error! node exit! ")
      process.exit(1)
    }

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      this.log_info("Hive on Ctrl+C", "Handler", "On Exiting", "Exiting...")
      this.stop()
      this.log_info("Hive Stopped", "Handler", "Hive Stopped", "Exit")
      process.exit(0)
    })

  } // end of init

  get_node_stat() {
  // get node stat
    this.redis.exists(this.node_stat_hset).then((res) => {
      if (res == 1) {
        this.redis.hget(this.node_stat_hset, this.node_id, (err, res) => {
          if (err) {
            this.log_err("get_node_stat", "find node info in node_stat_hset", this.node_id, err, `cannot find node with id: ${this.node_id} in node_stat_hset.`)
            // 用node 的当前state update node_stat ,并 Update node 状态表 node_stat_hset
            this.update_node_stat()
          } else {
            this.node_stat = JSON.parse(res)
            this.log_info("get_node_stat", "find node info in node_stat_hset", this.node_stat, `found node with id: ${this.node_id} in node_stat_hset.`)
          }
        })
      } else {
        this.node_stat = {}
        this.log_err("get_node_stat", "Check node_stat_hset", this.node_stat_hset, "Not Exists", `cannot find node with id: ${this.node_id} in node_stat_hset.`)
        // 没有node_stat表没太大关系,node Start 后把状态push到redis上也OK.
      }
    })
  } // end of get_node_stat

  get_tasks_from_node_stat() {
  // get tasks from node stat
    if (Object.keys(this.node_stat).length !== 0) {
      // get node tasks from node statues table
      this.node_tasks = this.node_stat.task_list.map((item) => { return item.task_content })
      this.log_info("get_tasks_from_node_stat", "From node_stat get node_tasks", this.node_tasks, "Get node tasks from node_stat successfully.")
    } else {
      this.node_tasks = []
      this.log_info("get_tasks_from_node_stat", "From node_stat get node_tasks", this.node_tasks, "node_stat is NULL.")
    }
  } // end of get_tasks_from_node_stat

  resume_tasks() {
  // 根据tasks生成bees
    if (this.node_tasks.length > 0) {
      // 创建bees, Bee在ssh_on_ready后会自动Start 采集
      this.bees = this.node_tasks.map((task) => new Bee(task, this.node_id, this.node_type))
      // 只保留创建Success的bee.创建fail 的,直接丢弃,对应的task也会被丢弃.
      this.bees = this.bees.filter((bee) => bee.health === true)

      this.task_count = this.bees.length

      this.log_info("resume_tasks", "Generate Bees from tasks in node_stat", `Bee Number: ${this.bees.length}`, "Generate Bees for resuming tasks in node successfully.")
      // Bee在ssh_on_ready后会自动Start 采集,不需要调用start()
      // this.bees.forEach((bee) => bee.start());
      // 只保留Start Success的bee.Start fail 的,直接丢弃,对应的task也会被丢弃.
    } else {
      // node_stat have no task, no need resume harvest.
      this.bees = []

      this.task_count = this.bees.length

      this.log_info("resume_tasks", "bees=[]", "bees=[]", " No Left task.")
    }
  } // end of resume_tasks

  start() {
  // 听task-queue接受New  Task
    this.chk_task_interval = setInterval(
      this.chk_new_task.bind(this),
      this.chk_new_task_interval_ms
    )
    this.log_info("start", "Start chk_new_task_interval Func", `chk_new_task_interval: ${this.chk_task_interval}`, "Start New Task Listening.")

    // 设置定时 Update node_stat_table
    this.update_node_stat_interval = setInterval(
      this.update_node_stat.bind(this),
      this.node_stat_update_interval_ms
    )
    this.log_info("start", "Start update_node_stat_interval", `update_node_stat_interval: ${this.update_node_stat_interval}`, "Start Node State Update Routinely.")
  } // end of start

  chk_new_task() {
    // listen to task-queue
    this.redis.lpop(this.task_req_queue, (err, res) => {
      if (err) {
        this.log_err("chk_new_task", "listen to task-queue", `Task REQ Queue:${ this.task_req_queue }`, err, "listen to task-queue fail .")
        throw err
      } else {
        if (res === null) {
          return
        }

        // 从 Task队列中get 出 Task
        let task = JSON.parse(res)

        if (task.type === "parser") {
          // Send Back to Task Queue
          this.redis.rpush(this.task_req_queue, JSON.stringify(task))
          this.log_info("chk_new_task", "Parser Task", task, "Send Back to Task Queue.")
          return
        }

        if (task.node_id === this.node_id
          && task.scope === "task"
          && task.action === "stop") {
          //  Stop  Task
          this.stop_bee(task.task_id_for_stop)
          // task exec response
          this.update_task_result(task, "success", `success stop task:${task.id}.`)
          //  Stop  Task,  Update node_stat
          this.update_node_stat()
          this.log_info("chk_new_task", "Task-Stop Task", task, "Task-Stop Task,Completed.")
          return
        }

        if (task.node_id === this.node_id
          && task.scope === "node"
          && task.action === "chg_task_limit") {
          // 修改 Task限制
          this.task_limit = task.task_limit
          this.update_task_result(task, "success", `success change task_limit to ${task.task_limit} on node: ${this.node_id}.`)
          this.update_node_stat()
          this.log_info("chk_new_task", "Chk Task Limit", task, "Task Limit Change,Completed.")
          return
        }

        if (task.action === "start") {
          if (this.bees.length >= this.task_limit) {
            // Over Node Task Limit, Send Back to Task Queue
            this.redis.rpush(this.task_req_queue, JSON.stringify(task))
            this.log_info("chk_new_task", "Over Node Task Limit", task, "Over Node Task Limit, Send Back to Task Queue.")
            return
          }

          // 生成New 的bee,  finish 采集 Task
          const bee = new Bee(task, this.node_id, this.node_type)
          // Bee在ssh_on_ready后会自动Start 采集,不需要调用start()
          // bee.start();
          // 加入bees
          this.bees.push(bee)

          this.task_count = this.bees.length

          // task exec response
          this.update_task_result(task, "success", `success start task:${task.id}.`)
          // 增加New Task, Start New 的Bee,  Update node_stat
          this.update_node_stat()
          const bee_stat = {
            bee_id: bee.id,
            bee_action: bee.action,
            bee_health: bee.health,
            bee_state: bee.state,
            bee_ssh_state: bee.ssh_state
          }
          this.log_info("chk_new_task", "Start New Bee", bee_stat, "Start Bee Success.")
          return
        } // end of if (task.action === "start")

        // other cases, send task back
        this.redis.rpush(this.task_req_queue, JSON.stringify(task))
        this.log_info("chk_new_task", "Unknown Task Type", task.action, "Unknown Task Type, Send Back to Task Queue.")
        return
      } // end of get  Task
    })
  } // end of chk_new_task

  update_node_stat() {

    // check alive bees
    this.bees = this.bees.filter((bee) => bee.health === true)

    if (this.node_stat === undefined || this.node_stat === null) {
      this.node_stat = {}
    }

    //  Update node_stat中的node信息
    this.node_stat.id = this.node_id
    this.node_stat.type = this.node_type
    this.node_stat.start_ts = this.start_ts
    this.node_stat.uptime = Date.now() - this.start_ts
    this.node_stat.task_limit = this.task_limit
    this.node_stat.task_count = this.bees.length
    this.node_stat.redis_url = this.redis_url
    this.node_stat.task_req_queue = this.task_req_queue
    this.node_stat.task_rsq_queue = this.task_rsp_queue
    this.node_stat.node_stat_hset = this.node_stat_hset

    this.uptime = this.node_stat.uptime

    //  Update node_stat中的task信息
    if (this.bees.length > 0) {
      this.node_stat.task_list = this.bees.map((bee) => {
        return {
          "task_content": bee.task,
          "task_state": {
            "state": bee.state,
            "state_desc": bee.state,
            "start_ts": bee.start_ts,
            "uptime": Date.now() - bee.start_ts,
            "work_count": bee.line_count,
          }
        }
      })
    } else {
      this.node_stat.task_list = []
    }

    // 把node_stat Update 到node_stat_table
    this.redis.hset(
      this.node_stat_hset,
      this.node_id,
      JSON.stringify(this.node_stat),
      (err, res) => {
        if (err) {
          this.log_err("update_node_stat", " Update node_stat fail .", `node_stat_hset:${this.node_stat_hset}, node_id:${this.node_id}`, err, " Update node_stat fail .")
        } else {
          // this.log_info("update_node_stat", " Update node_stat", `hset_response:${res}`, " Update Node State Success.")
        }
      }
    )
  } // end of update_node_stat

  stop_bee(bee_id) {
    //  Stop bee
    const bee_need_stop = this.bees.filter((bee) => bee.id === bee_id)[0]
    if (!bee_need_stop) {
      this.log_err("stop_bee", "get Bee", `bee_id:${bee_id}`, "undefined", "get Bee fail .")
      return
    }

    bee_need_stop.stop()
    this.log_info("stop_bee", " Stop bee", `Stopped Bee ID:${bee_need_stop.id}`, " Stop beeSuccess.")

    // 从bees中Delete Bee
    this.bees = this.bees.filter((bee) => bee.id !== bee_id)

    this.task_count = this.bees.length

    this.log_info("stop_bee", "Delete Bee", `Removed Bee ID:${bee_id}`, "Delete bee from Bees Success.")
  } // end of stop_bee

  stop() {
  //  Stop listen to task-queue
    clearInterval(this.chk_task_interval)
    this.log_info("stop", " Stop listen to task-queue", "chk_task_interval", " Stop listen to task-queueSuccess.")

    //  Stop bees
    this.bees.forEach((bee) => bee.stop())
    this.bees = []

    this.task_count = this.bees.length

    this.log_info("stop", "Stop all Bees", `Number of Bee:${this.bees.length}`, "Stop all Bees Success.")

    // Delete node_stat
    this.redis.hdel(this.node_stat_hset, this.node_id)
    this.log_info("stop", "Delete node_stat", `node_stat_hset:${this.node_stat_hset}, node_id:${this.node_id}`, "Delete Node State Success.")

    //  Stop node state update
    clearInterval(this.update_node_stat_interval)
    this.log_info("stop", " Stop node state update", "update_node_stat_interval", " Stop node state updateSuccess.")

    // 断开redis连接
    this.redis.quit()
    this.log_info("stop", "Redis Disconnect", "redis.quit()", "Redis Disconnected.")
  } // end of stop

  update_task_result(task, result, desc) {
    this.redis.rpush(this.task_rsp_queue, JSON.stringify(
      {
        "node_id": this.node_id,
        "node_type": this.node_type,
        "task": task,
        "result": result,
        "result_desc": desc
      }
    ))
    return
  }

  log_info(func, step, result, msg) {
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: func,
        step: step,
        result: result
      },
      msg
    )
  } // end of log_info

  log_err(func, step, check, error, msg) {
    logger.error(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: func,
        step: step,
        check: check,
        error: error
      },
      msg
    )
  } // end of log_err

} // end of class Hive

const hive = new Hive()
hive.start()
