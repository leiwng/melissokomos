/***
  Broker convert task request and response message from and to outside.
***/

const Redis = require("ioredis")
const logger = require("./broker_logger")(require("path").basename(__filename))
require("dotenv").config()

const L2R_TASK_TYPE = require("./msg_cvt_tab").L2R_TASK_TYPE
const L2R_TASK_ACTION = require("./msg_cvt_tab").L2R_TASK_ACTION
const L2R_EXEC_TYPE = require("./msg_cvt_tab").L2R_EXEC_TYPE
const R2L_RSP_TASK_ACTION = require("./msg_cvt_tab").R2L_RSP_TASK_ACTION
const R2L_RSP_TASK_TYPE = require("./msg_cvt_tab").R2L_RSP_TASK_TYPE
const R2L_RSP_TASK_RESULT = require("./msg_cvt_tab").R2L_RSP_TASK_RESULT

class Broker {
  constructor() {
    this.init()
  }

  init() {
    this.node_type = "broker"
    this.node_id = process.env.BROKER_NODE_ID

    this.l_redis_url = process.env.L_REDIS_URL
    this.l_task_agent_q = process.env.L_TASK_AGENT_Q
    this.l_task_active_q = process.env.L_TASK_ACTIVE_Q
    this.l_task_passive_q = process.env.L_TASK_PASSIVE_Q
    this.l_task_rsp_q = process.env.L_TASK_RSP_Q
    this.l_task_chg_ch = process.env.L_TASK_CHG_CH
    this.l_node_chg_ch = process.env.L_NODE_CHG_CH
    this.l_node_rsp_q = process.env.L_NODE_RSP_Q

    this.r_redis_url = process.env.R_REDIS_URL
    this.r_task_req_q = process.env.R_TASK_REQ_Q
    this.r_task_rsp_q = process.env.R_TASK_RSP_Q
    this.r_node_stat_hset = process.env.R_NODE_STAT_HSET

    this.chk_new_task_interval_ms = process.env.CHK_NEW_TASK_INTERVAL_MS
    this.chk_task_rsp_interval_ms = process.env.CHK_TASK_RSP_INTERVAL_MS

    this.l_redis_client = null
    this.r_redis_client = null

    this.on_chk_new_task = false
    this.on_chk_task_rsp = false

    try {
      this.l_redis_client = new Redis(this.l_redis_url)
      this.r_redis_client = new Redis(this.r_redis_url)
    } catch (err) {
      this.log_err(
        "init",
        "create_redis_client",
        "error",
        err,
        "Create Redis Client Error"
      )
      process.exit(1)
    }
  }

  start() {
    this.log_info("start", "start", "info", "Starting Broker...")

    this.chk_new_task_interval_func = setInterval(
      this.chk_new_task.bind(this),
      this.chk_new_task_interval_ms
    )

    this.chk_task_rsp_interval_func = setInterval(
      this.chk_task_rsp.bind(this),
      this.chk_task_rsp_interval_ms
    )

    this.l_redis_client.on("message", this.on_chg_msg.bind(this))
    this.l_redis_client.subscribe(
      this.l_task_chg_ch,
      this.l_node_chg_ch,
      (err, count) => {
        if (err) {
          this.log_err("start", "subscribe", "error", err, "Subscribe Error")
          process.exit(1)
        }
        this.log_info(
          "start",
          "subscribe to l_task_chg_ch",
          "success",
          `Subscribed to ${this.l_task_chg_ch} with subscriber count: ${count}.`
        )
      }
    )

    this.log_info("start", "start", "info", "Broker Started.")
  }

  on_chg_msg(channel, message) {
    const l_task = JSON.parse(message)
    let r_task = {}

    switch (channel) {
      case this.l_task_chg_ch:
        // Convert Left-side Task Change Message to Right-side Task Change Message
        r_task = {
          node_id: l_task.NODENAME,
          scope: "task", // Added for right-side
          action: L2R_TASK_ACTION[l_task.ACTION],
          task_id_for_stop: l_task.TASKID,
        }
        this.r_redis_client.rpush(this.r_task_req_q, JSON.stringify(r_task))
        break
      case this.l_node_chg_ch:
        // Convert Left-side node change message to Right-side node change message
        r_task = {
          node_id: l_task.NODENAME,
          scope: "node", // Added for right-side
          action: L2R_TASK_ACTION[l_task.ACTION],
          task_limit: l_task.NUM_TASK,
        }
        this.r_redis_client.rpush(this.r_task_req_q, JSON.stringify(r_task))
        break
      default:
        // Handle messages from other channels
        break
    }
  }

  chk_new_task() {
    if (this.on_chk_new_task) {
      return
    }
    this.on_chk_new_task = true

    // Check Agent Task from Left-side Agent Task Queue, if there is task, send to Right-side Task Req Queue.
    this.l_redis_client.blpop(this.l_task_agent_q, 0, (err, res) => {
      if (err) {
        this.log_err(
          "chk_new_task",
          "l_redis_client.blpop",
          "error",
          err,
          "L Redis Client Blpop Error"
        )
        process.exit(1)
      }
      if (res) {
        const l_task = JSON.parse(res[1])
        const r_task = {
          id: l_task.TASKID,
          name: l_task.NAME,
          node_id: "", // New Task, no need to assign node_id
          scope: "task", // Added for right-side
          type: L2R_TASK_TYPE[l_task.TYPE],
          action: L2R_TASK_ACTION[l_task.ACTION],
          desc: l_task.DESC,
          in: {
            redis_url: l_task.INPUT.URL,
            redis_sub_ch: l_task.INPUT.CHANNEL,
            encoding: l_task.INPUT.ENCODING,
            parameter: l_task.INPUT.COLLECTOR_PARAM,
          },
          out: {
            redis_url: l_task.OUTPUT.URL,
            redis_pub_ch: l_task.OUTPUT.CHANNEL,
          },
        } // finish compose right-side task
        // Send to Right-side Task Req Queue
        this.r_redis_client.rpush(this.r_task_req_q, JSON.stringify(r_task))
      }
    })

    // Check Passive Task from Left-side Passive Task Queue, if there is task, send to Right-side Task Req Queue.
    this.l_redis_client.blpop(this.l_task_passive_q, 0, (err, res) => {
      if (err) {
        this.log_err(
          "chk_new_task",
          "l_redis_client.blpop",
          "error",
          err,
          "L Redis Client Blpop Error"
        )
        process.exit(1)
      }
      if (res) {
        const l_task = JSON.parse(res[1])
        const r_task = {
          id: l_task.TASKID,
          name: l_task.NAME,
          node_id: "", // New Task, no need to assign node_id
          scope: "task", // Added for right-side
          type: L2R_TASK_TYPE[l_task.TYPE],
          action: L2R_TASK_ACTION[l_task.ACTION],
          desc: l_task.DESC,
          in: {
            ssh_host: l_task.INPUT.SSH_HOST,
            ssh_port: l_task.INPUT.SSH_PORT,
            ssh_user: l_task.INPUT.SSH_USER,
            ssh_pass: l_task.INPUT.SSH_PASS,
            encoding: l_task.INPUT.ENCODING,
            shell_cmd: l_task.INPUT.COMMAND_LINE,
          },
          out: {
            redis_url: l_task.OUTPUT.URL,
            redis_pub_ch: l_task.OUTPUT.CHANNEL,
          },
        } // finish compose right-side task
        // Send to Right-side Task Req Queue
        this.r_redis_client.rpush(this.r_task_req_q, JSON.stringify(r_task))
      }
    })

    // Check Active Task from Left-side Active Task Queue, if there is task, send to Right-side Task Req Queue.
    this.l_redis_client.blpop(this.l_task_active_q, 0, (err, res) => {
      if (err) {
        this.log_err(
          "chk_new_task",
          "l_redis_client.blpop",
          "error",
          err,
          "L Redis Client Blpop Error"
        )
        process.exit(1)
      }
      if (res) {
        const l_task = JSON.parse(res[1])
        const r_task = {
          id: l_task.TASKID,
          name: l_task.NAME,
          node_id: "", // New Task, no need to assign node_id
          scope: "task", // Added for right-side
          type: L2R_TASK_TYPE[l_task.TYPE],
          action: L2R_TASK_ACTION[l_task.ACTION],
          desc: l_task.DESC,
          in: {
            ssh_host: l_task.INPUT.SSH_HOST,
            ssh_port: l_task.INPUT.SSH_PORT,
            ssh_user: l_task.INPUT.SSH_USER,
            ssh_pass: l_task.INPUT.SSH_PASS,
            encoding: l_task.INPUT.ENCODING,
            shell_cmd: l_task.INPUT.COMMAND_LINE,
            exec_type: L2R_EXEC_TYPE[l_task.INPUT.COLLECTOR_TYPE],
            trigger: l_task.INPUT.TRIGGER,
          },
          out: {
            redis_url: l_task.OUTPUT.URL,
            redis_pub_ch: l_task.OUTPUT.CHANNEL,
          },
        } // finish compose right-side task
        // Send to Right-side Task Req Queue
        this.r_redis_client.rpush(this.r_task_req_q, JSON.stringify(r_task))
      }
    })

    // Check Parser Task from Left-side Parser Task Queue, if there is task, send to Right-side Task Req Queue.
    this.l_redis_client.blpop(this.l_task_parser_q, 0, (err, res) => {
      if (err) {
        this.log_err(
          "chk_new_task",
          "l_redis_client.blpop",
          "error",
          err,
          "L Redis Client Blpop Error"
        )
        process.exit(1)
      }
      if (res) {
        const l_task = JSON.parse(res[1])
        const r_task = {
          id: l_task.TASKID,
          name: l_task.NAME,
          node_id: "", // New Task, no need to assign node_id
          scope: "task", // Added for right-side
          type: L2R_TASK_TYPE[l_task.TYPE],
          action: L2R_TASK_ACTION[l_task.ACTION],
          desc: l_task.DESC,
          recipe: l_task.PARSER_PLUGIN,
          in: {
            redis_url: l_task.INPUT.URL,
            redis_sub_ch: l_task.INPUT.CHANNEL,
          },
          out: {
            redis_url: l_task.OUTPUT.URL,
            redis_pub_ch: l_task.OUTPUT.CHANNEL,
          },
        } // finish compose right-side task
        // Send to Right-side Task Req Queue
        this.r_redis_client.rpush(this.r_task_req_q, JSON.stringify(r_task))
      }
    })

    this.on_chk_new_task = false
  } // end of chk_new_task()

  chk_task_rsp() {
    if (this.on_chk_task_rsp) {
      return
    }
    this.on_chk_task_rsp = true

    // Check Task Rsp from Right-side Task Rsp Queue, if there is task, send to Left-side Task Rsp Queue.
    this.r_redis_client.blpop(this.r_task_rsp_q, 0, (err, res) => {
      if (err) {
        this.log_err(
          "chk_task_rsp",
          "r_redis_client.blpop",
          "error",
          err,
          "R Redis Client Blpop Error"
        )
        process.exit(1)
      }
      if (res) {
        // TODO: handle node limit change response message.
        // TODO: handle node start/stop response message.
        const r_rsp = JSON.parse(res[1])
        if (r_rsp.task.action === "task_limit_change") {
          // task response for node task limit change
          const l_rsp = {
            ACTION: R2L_RSP_TASK_ACTION[r_rsp.task.action],
            NODENAME: r_rsp.node_id,
            RESULT: R2L_RSP_TASK_RESULT[r_rsp.result],
            NUM_TASK: r_rsp.task.task_limit,
            DESC: r_rsp.result_desc,
          }
          // Send to Left-side node task return queue
          this.l_redis_client.rpush(this.l_node_rsp_q, JSON.stringify(l_rsp))
        } else if (r_rsp.task.action === "node_start") {
          //TODO: handle node start response message in Hive and Cellar
          // task response for node started/stopped/errored-exit
          const l_rsp = {
            ACTION: R2L_RSP_TASK_ACTION[r_rsp.action],
            NODENAME: r_rsp.node_id,
            RESULT: R2L_RSP_TASK_RESULT[r_rsp.result],
            DESC: r_rsp.result_desc,
          }
          // Send to Left-side node task return queue
          this.l_redis_client.rpush(this.l_node_rsp_q, JSON.stringify(l_rsp))
        } else {
          // task response for task start/stop
          const l_rsp = {
            ACTION: R2L_RSP_TASK_ACTION[r_rsp.task.action],
            TASKID: r_rsp.task.id,
            RESULT: R2L_RSP_TASK_RESULT[r_rsp.result],
            TYPE: R2L_RSP_TASK_TYPE[r_rsp.task.type],
            NAME: r_rsp.task.name,
            DESC: r_rsp.result_desc,
            NODENAME: r_rsp.node_id,
          } // finish compose left-side task response message
          // Send to Left-side Task Rsp Queue
          this.l_redis_client.rpush(this.l_task_rsp_q, JSON.stringify(l_rsp))
        }
      }
    })

    this.on_chk_task_rsp = false
  } // end of chk_task_rsp()

  log_info(func, step, info, msg) {
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: func,
        step: step,
        info: info,
      },
      msg
    )
  }

  log_err(func, step, info, err, msg) {
    logger.error(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: func,
        step: step,
        info: info,
        err: err,
      },
      msg
    )
  }

  log_dbg(func, step, info, dbg, msg) {
    logger.error(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: func,
        step: step,
        info: info,
        dbg: dbg,
      },
      msg
    )
  }
}
