/***
 * Bumblebee 负责通过 ssh 通道从远程目标机上被动获取日志数据
 * Bumblebee 实现数据采集的自管理 self-management，包括：
 * 1. 以容器运行，对自身负载进行监控，当负载过高时，自动停止接受新的采集任务
 * 2. 自动读取采集任务,并交由 Bumblebee 执行
 * 3. 非正常终止，重启后会优先恢复现有任务，然后再获取新任务
***/
const { Client } = require('ssh2');
const Redis = require("ioredis");
const logger = require("./bumblebee_logger")


class Bumblebee {
  constructor(task) {

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

    // 根据任务参数初始化对象属性
    this.init(task)

    if (this.health === false) {
      return
    }

    // 部署任务
    try {
      this.ssh
        .on('ready', this.ssh_on_ready)
        .on('error', this.ssh_on_error)
        .on('end', this.ssh_on_end)
        .on('close', this.ssh_on_close)
        .on('keyboard-interactive', this.ssh_on_keyboard_interactive)
        .connect({
          host: this.ssh_host,
          port: this.ssh_port,
          username: this.ssh_user,
          password: this.ssh_pass
        });
    } catch (err) {
      this.health = false
      this.state = "error"
      logger.error(
        {
          bee_id: this.id,
          ssh_host: this.ssh_host,
          ssh_port: this.ssh_port,
          ssh_user: this.ssh_user,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        'Bumblebee, ssh connect failed'
      );
      return
    }
  } // end of constructor

  init(task) {
    this.task = task

    this.id = task.id
    this.action = task.action
    this.name = task.name
    this.desc = task.desc

    this.start_ts = Date.now()
    this.uptime = 0
    this.health = true
    this.state = "running"

    this.ssh_host = task.in.ssh_host
    this.ssh_port = task.in.ssh_port
    this.ssh_user = task.in.ssh_user
    this.ssh_pass = task.in.ssh_pass
    this.ssh_cmd = task.in.shell_cmd
    this.ssh_encoding = task.in.encoding

    try {
      this.pub = new Redis(task.out.redis_url)
    } catch (err) {
      this.health = false
      this.state = "error"
      logger.error(
        {
          bee_id: this.id,
          redis_url: task.out.redis_url,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        'Bumblebee, init redis failed'
      );
      return
    }
    this.redis_pub_ch = task.out.redis_pub_ch

    try {
      this.ssh = new Client();
    } catch (err) {
      this.health = false
      this.state = "error"
      logger.error(
        {
          bee_id: this.id,
          redis_url: task.out.redis_url,
          task: JSON.stringify(task),
          error: JSON.stringify(err)
        },
        'Bumblebee, init ssh client failed'
      );
      return
    }

    this.ssh_data_buffer = '';
    this.ssh_status = 'connecting';
    this.line_count = 0

    logger.info(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_encoding: this.ssh_encoding,
        redis_url: this.redis_url,
        redis_pub_ch: this.redis_pub_ch
      },
      'Bumblebee, init finished'
    );

  } // end of init

  ssh_on_ready() {
    this.ssh_status = 'ready'
    logger.info(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_status: this.ssh_status
      },
      'Bumblebee, SSH on ready'
    );
    // ssh 链路ready，可以开始采集工作
    if (this.action === "start") {
      this.start()
    }
  }

  ssh_on_error(err) {
    this.ssh_status = 'error'
    this.health = false
    this.state = "error"
    console.log(err)
    logger.error(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_status: this.ssh_status,
        task: JSON.stringify(task),
        error: JSON.stringify(err)
      },
      'Bumblebee, SSH on error'
    );
    this.ssh.end();
  }

  ssh_on_end() {
    this.ssh_status = 'end'
    logger.info(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_status: this.ssh_status
      },
      'Bumblebee, SSH on end');
  }

  ssh_on_close() {
    this.ssh_status = 'closed'
    logger.info(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_status: this.ssh_status
      },
      'Bumblebee, SSH on close');
  }

  ssh_on_keyboard_interactive(name, instructions, instructionsLang, prompts, finish) {
    this.ssh_status = 'keyboard-interactive'
    logger.info(
      {
        bee_id: this.id,
        task: JSON.stringify(task),
        keyboard_interactive_name: name,
        keyboard_interactive_instructions: instructions,
        keyboard_interactive_instructionsLang: instructionsLang,
        keyboard_interactive_prompts: prompts,
        keyboard_interactive_finish: finish
      },
      'Bumblebee, SSH on keyboard-interactive'
    );
  }

  start() {
    logger.info(
      {
        bee_id: this.id
      },
      'Bumblebee, starting...'
    );

    if (this.ssh_status != 'ready') {
      this.health = false
      this.state = "error"
      logger.error(
        {
          bee_id: this.id,
          task: JSON.stringify(task),
        },
        'Bumblebee, SSH is not ready')
      return
    }

    this.ssh.exec(this.ssh_cmd, (err, stream) => {
      if (err) {
        this.ssh_status = "exec_error";
        this.health = false;
        this.state = "error";
        logger.error(
          {
            bee_id: this.id,
            task: JSON.stringify(task),
            error: JSON.stringify(err)
          },
          'Bumblebee, SSH failed'
        );
        throw err;
      }

      stream
        .on('close', this.ssh_stream_on_close)
        .on('data', this.ssh_stream_on_data)
        .stderr.on('data', this.ssh_stream_stderr_on_data);
    });
  } // end of start

  ssh_stream_on_close(code, signal) {
    this.ssh_status = 'stream_on_close'
    logger.info(
      {
        bee_id: this.id,
        stream_on_close_code: code,
        stream_on_close_signal: signal
      },
      'Bumblebee, SSH Stream on close'
    );
    this.ssh.end();
    return
  }

  ssh_stream_on_data(data) {
    this.ssh_status = 'on_data'
    if (data !== undefined) {

      //空行
      if (data.length === 1 && data[0] === 10) {
        //收到回车，把缓存的数据发送到redis
        if (this.ssh_data_buffer !== '') {

          let now = new Date()
          const data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: this.ssh_data_buffer })

          // 按行PUB出去
          this.pub.publish(this.redis_pub_ch, data_line)
          this.line_count += 1
          this.uptime = Date.now() - this.start_ts

          this.ssh_data_buffer = ''
          return
        }
        return
      }

      // 非空行
      // 判断收到的数据是否以回车符结束
      let end_with_LF = false
      if (data[data.length - 1] === 10) {
        end_with_LF = true
      }

      // 分行
      this.ssh_data_buffer += data.toString('utf-8')
      let lines = this.ssh_data_buffer.split('\n')

      // 没收到回车符，一行未结束，继续囤积
      if (lines.length === 1) {
        return
      }

      // 收到回车符，有多行数据待处理，且只处理到倒数第二行
      let now = new Date()
      for (let i = 0; i < lines.length - 1; i++) {
        const data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[i] })

        // 按行PUB出去
        this.pub.publish(this.redis_pub_ch, data_line)
        this.line_count += 1
        this.uptime = Date.now() - this.start_ts
      }
      // 最后一行数据，如果以回车符结束，就清空缓存，否则缓存起来
      if (end_with_LF) {
        const data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[lines.length - 1] })

        // 按行PUB出去
        this.pub.publish(this.redis_pub_ch, data_line)
        this.line_count += 1
        this.uptime = Date.now() - this.start_ts

        this.ssh_data_buffer = ''
      } else {
        this.ssh_data_buffer = lines[lines.length - 1]
      }
    }
  }

  ssh_stream_stderr_on_data(data) {
    this.ssh_status = 'on_stderr'
    this.health = false
    this.state = "error"
    logger.info(
      {
        bee_id: this.id,
        data: data
      },
      'Bumblebee, SSH Stream on stderr'
    )
  }

  stop() {
    logger.info(
      {
        bee_id: this.id
      },
      'Bumblebee, stopping...'
    );

    if (this.ssh !== undefined) {
      this.ssh.end()
    }

    if (this.pub !== undefined) {
      this.pub.disconnect()
    }

    logger.info(
      {
        bee_id: this.id
      },
      'Bumblebee, stopped.'
    );
  } // end of stop

}; // end of class Bumblebee

module.exports = Bumblebee