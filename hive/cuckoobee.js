/***
 * Cuckoobee 喜鹊蜂, 主动采集, 通过 ssh 通道从远程目标机上执行 shell script 获get 花粉。
 * TODO: ssh_on_ready is not proper work with start() on "Interval" and "On_Time" case,
 * TODO: need to consider a better way
***/
const { Client } = require("ssh2")
const Redis = require("ioredis")
const cron = require("node-cron")
const logger = require("./hive_logger")(require("path").basename(__filename))


class Cuckoobee {
  constructor(task, node_id, node_type) {

    // member function
    this.init = this.init.bind(this)
    this.ssh_on_ready = this.ssh_on_ready.bind(this)
    this.ssh_on_error = this.ssh_on_error.bind(this)
    this.ssh_on_end = this.ssh_on_end.bind(this)
    this.ssh_on_close = this.ssh_on_close.bind(this)
    this.ssh_on_keyboard_interactive = this.ssh_on_keyboard_interactive.bind(this)
    this.ssh_stream_on_close = this.ssh_stream_on_close.bind(this)
    this.ssh_stream_on_data = this.ssh_stream_on_data.bind(this)
    this.ssh_stream_stderr_on_data = this.ssh_stream_stderr_on_data.bind(this)
    this.start = this.start.bind(this)
    this.stop = this.stop.bind(this)
    this.shell_cmd_exec = this.shell_cmd_exec.bind(this)

    // 根据 Task参数初始化对象属性
    this.init(task, node_id, node_type)

    if (this.health === false) {
      return
    }

    // 部署 Task
    try {
      this.ssh
        .on("ready", this.ssh_on_ready.bind(this))
        .on("error", this.ssh_on_error.bind(this))
        .on("end", this.ssh_on_end.bind(this))
        .on("close", this.ssh_on_close.bind(this))
        .on("keyboard-interactive", this.ssh_on_keyboard_interactive.bind(this))
        .connect({
          host: this.ssh_host,
          port: this.ssh_port,
          username: this.ssh_user,
          password: this.ssh_pass
        })
    } catch (err) {
      this.set_state(false, "error", this.ssh_state)
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          ssh_host: this.ssh_host,
          ssh_port: this.ssh_port,
          ssh_user: this.ssh_user,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        "Cuckoobee, ssh connect failed"
      )
      return
    }
  } // end of constructor

  init(task, node_id, node_type) {
    this.task = task
    this.node_id = node_id
    this.node_type = node_type

    this.id = task.id
    this.action = task.action
    this.name = task.name
    this.desc = task.desc

    this.start_ts = Date.now()
    this.uptime = 0

    this.set_state(true, "running", "ssh_on_init")

    this.ssh_host = task.in.ssh_host
    this.ssh_port = task.in.ssh_port
    this.ssh_user = task.in.ssh_user
    this.ssh_pass = task.in.ssh_pass
    this.ssh_cmd = task.in.shell_cmd
    this.ssh_encoding = task.in.encoding
    this.exec_type = task.in.exec_type
    this.trigger = task.in.trigger
    this.task_exec_handler = null
    this.ssh = null
    this.pub = null
    // avoid shell_cmd executing concurrent to mass up the data in output pub channel
    this.on_shell_cmd_executing = false

    try {
      this.pub = new Redis(task.out.redis_url)
    } catch (err) {
      this.set_state(false, "error", this.ssh_state)
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          redis_url: task.out.redis_url,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        "Cuckoobee, init redis failed."
      )
      return
    }
    this.redis_pub_ch = task.out.redis_pub_ch

    try {
      this.ssh = new Client()
    } catch (err) {
      this.set_state(false, "error", "ssh_on_error")
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          redis_url: task.out.redis_url,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        "Cuckoobee, init ssh client failed"
      )
      return
    }

    this.ssh_data_buffer = ""
    this.line_count = 0

    this.set_state(true, "init", "connecting")

    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_encoding: this.ssh_encoding,
        redis_url: this.redis_url,
        redis_pub_ch: this.redis_pub_ch
      },
      "Cuckoobee, init finished"
    )

  } // end of init

  ssh_on_ready() {
    this.set_state(true, "running", "ssh_on_ready")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_state: this.ssh_state
      },
      "Cuckoobee, SSH on ready"
    )
    // ssh 链路ready, 可以开始采集工作
    if (this.action === "start") {
      this.start()
    }
  }

  ssh_on_error(err) {
    this.set_state(false, "error", "ssh_on_error")
    logger.error(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_state: this.ssh_state,
        task: JSON.stringify(this.task),
        error: JSON.stringify(err)
      },
      "Cuckoobee, SSH on error"
    )
    this.ssh.end()
  }

  ssh_on_end() {
    this.set_state(true, "stopped", "ssh_on_end")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_state: this.ssh_state
      },
      "Cuckoobee, SSH on end")
  }

  ssh_on_close() {
    this.set_state(true, "stopped", "ssh_on_close")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_state: this.ssh_state
      },
      "Cuckoobee, SSH on close")
  }

  ssh_on_keyboard_interactive(name, instructions, instructionsLang, prompts, finish) {
    this.set_state(true, "running", "ssh_on_keyboard_interactive")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        task: JSON.stringify(this.task),
        keyboard_interactive_name: name,
        keyboard_interactive_instructions: instructions,
        keyboard_interactive_instructionsLang: instructionsLang,
        keyboard_interactive_prompts: prompts,
        keyboard_interactive_finish: finish
      },
      "Cuckoobee, SSH on keyboard-interactive"
    )
  }

  start() {
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
      },
      "Cuckoobee, starting..."
    )

    if (this.ssh_state !== "ssh_on_ready") {
      this.set_state(false, "error", this.ssh_state)
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          task: JSON.stringify(this.task),
        },
        "Cuckoobee, SSH is not ready")
      return
    }

    const hhmmss = this.trigger.split(":")
    const hh = parseInt(hhmmss[0])
    const mm = parseInt(hhmmss[1])
    const ss = parseInt(hhmmss[2])
    // different process for different shell_cmd exec_type
    if (this.exec_type === "interval") {
      let interval_ts = (hh * 3600 + mm * 60 + ss) * 1000
      this.task_exec_handler = setInterval(this.shell_cmd_exec.bind(this), interval_ts)
    } else if (this.exec_type === "on_time") {
      let cron_syntax = `${ss} ${mm} ${hh} * * *`
      this.task_exec_handler = cron.schedule(cron_syntax, this.shell_cmd_exec.bind(this))
      this.task_exec_handler.start()
    } else if (this.exec_type === "one_shot") {
      this.task_exec_handler = this.shell_cmd_exec.bind(this)
      this.task_exec_handler()
    } else {
      this.set_state(false, "error", "exec_type_error")
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          task: JSON.stringify(this.task),
        },
        "Cuckoobee, exec_type is not supported")
      return
    }
  } // end of start

  shell_cmd_exec() {
    if (this.on_shell_cmd_executing) {
      return "There is one instance already executing."
    }
    this.on_shell_cmd_executing = true

    if (this.ssh_state === "ssh_on_close" || this.ssh_state === "ssh_on_end") {
      this.ssh.connect({
        host: this.ssh_host,
        port: this.ssh_port,
        username: this.ssh_user,
        password: this.ssh_pass
      })
    }

    this.ssh.exec(this.ssh_cmd, (err, stream) => {
      if (err) {
        this.set_state(false, "error", "exec_error")
        logger.error(
          {
            bee_id: this.id,
            node_id: this.node_id,
            node_type: this.node_type,
            task: JSON.stringify(this.task),
            error: JSON.stringify(err)
          },
          "Cuckoobee, SSH failed"
        )
        this.on_shell_cmd_executing = false
        throw err
      }

      stream
        .on("close", this.ssh_stream_on_close.bind(this))
        .on("data", this.ssh_stream_on_data.bind(this))
        .stderr.on("data", this.ssh_stream_stderr_on_data.bind(this))
    })
    return "on_shot Success."
  }

  ssh_stream_on_close(code, signal) {
    // ssh2 stream "close" event, which indicates that the remote command has finished executing.
    this.set_state(true, "running", "ssh_stream_on_close")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        stream_on_close_code: code,
        stream_on_close_signal: signal
      },
      "Cuckoobee, SSH Stream on close"
    )
    this.ssh.end()
    this.on_shell_cmd_executing = false
    return
  }

  ssh_stream_on_data(data) {
    this.set_state(true, "running", "ssh_stream_on_data")
    this.on_shell_cmd_executing = true
    if (data !== undefined) {

      //空行
      if (data.length === 1 && data[0] === 10) {
        //收到回车, 把缓存的数据发送到redis
        if (this.ssh_data_buffer !== "") {

          let now = new Date()
          const data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: this.ssh_data_buffer })

          // 按行PUB出去
          this.pub.publish(this.redis_pub_ch, data_line)
          this.line_count += 1
          this.uptime = Date.now() - this.start_ts

          this.ssh_data_buffer = ""
          return
        }
        return
      }

      // NOT 空行
      // 判断收到的数据是否以回车符结束
      let end_with_LF = false
      if (data[data.length - 1] === 10) {
        end_with_LF = true
      }

      // 分行
      this.ssh_data_buffer += data.toString("utf-8")
      let lines = this.ssh_data_buffer.split("\n")

      // 没收到回车符, 一行未结束, 继续囤积
      if (lines.length === 1) {
        return
      }

      // 收到回车符, 有多行数据待处理, 且只处理到倒数第二行
      let now = new Date()
      for (let i = 0; i < lines.length - 1; i++) {
        const data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[i] })

        // 按行PUB出去
        this.pub.publish(this.redis_pub_ch, data_line)
        this.line_count += 1
        this.uptime = Date.now() - this.start_ts
      }
      // 最后一行数据, 如果以回车符结束, 就清空缓存, 否则缓存起来
      if (end_with_LF) {
        const data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[lines.length - 1] })

        // 按行PUB出去
        this.pub.publish(this.redis_pub_ch, data_line)
        this.line_count += 1
        this.uptime = Date.now() - this.start_ts

        this.ssh_data_buffer = ""
      } else {
        this.ssh_data_buffer = lines[lines.length - 1]
      }
    }
  }

  ssh_stream_stderr_on_data(data) {
    this.set_state(false, "error", "ssh_stream_stderr_on_data")
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
        data: data
      },
      "Cuckoobee, SSH Stream on stderr"
    )
  }

  stop() {
    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type
      },
      "Cuckoobee, stopping..."
    )

    if (this.ssh !== null) {
      this.ssh.end()
    }

    if (this.pub !== null) {
      this.pub.quit()
    }

    if (this.exec_type === "interval") {
      if (this.task_exec_handler !== null) {
        clearInterval(this.task_exec_handler)
      }
    } else if (this.exec_type === "on_time") {
      if (this.task_exec_handler !== null) {
        this.task_exec_handler.stop()
      }
    } else if (this.exec_type === "one_shot") {
      this.task_exec_handler = null
    } else {
      this.set_state(false, "error", "exec_type_error")
      logger.error(
        {
          bee_id: this.id,
          node_id: this.node_id,
          node_type: this.node_type,
          task: JSON.stringify(this.task),
        },
        "Cuckoobee stop fail. exec_type is not supported")
      return
    }

    this.set_state(false, "stopped", "ssh_end")

    logger.info(
      {
        bee_id: this.id,
        node_id: this.node_id,
        node_type: this.node_type,
      },
      "Cuckoobee, stopped."
    )
  } // end of stop

  set_state(health, state, ssh_state) {
    this.ssh_state = ssh_state
    this.health = health
    this.state = state
  } // end of set_status

} // end of class Cuckoobee

module.exports = Cuckoobee