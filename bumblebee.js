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

    // 部署任务
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

  } // end of constructor

  init(task) {
    this.task = task

    this.id = task.TASKID
    this.action = task.ACTION //"start"
    this.name = task.NAME
    this.desc = task.DESC

    this.start_ts = Date.now()
    this.uptime = 0

    this.ssh_host = task.INPUT.SSH_HOST
    this.ssh_port = task.INPUT.SSH_PORT
    this.ssh_user = task.INPUT.SSH_USER
    this.ssh_pass = task.INPUT.SSH_PASS
    this.ssh_cmd = task.INPUT.COMMAND_LINE
    this.ssh_cmd_type = task.INPUT.COLLECTOR_TYPE //"LongScript"
    this.ssh_encoding = task.INPUT.ENCODING

    this.output_type = task.OUTPUT.TYPE //现在只支持redis "REDIS"
    this.output_method = task.OUTPUT.METHOD //现在只支持PUBLISH "PUSH"
    this.pub = new Redis(task.OUTPUT.URL)
    this.pub_channel = task.OUTPUT.CHANNEL

    this.ssh = new Client();

    // setup connection
    // Promise.promisifyAll(this.ssh)

    this.ssh_data_buffer = ''
    this.ssh_status = 'connecting'

    this.line_counter = 0

    logger.info(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_cmd: this.ssh_cmd,
        ssh_cmd_type: this.ssh_cmd_type,
        ssh_encoding: this.ssh_encoding,
        output_type: this.output_type,
        output_method: this.output_method,
        pub_channel: this.pub_channel
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
        ssh_pass: this.ssh_pass,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_status: this.ssh_status
      },
      'Bumblebee, SSH on ready'
    );

    // ssh 链路ready，可以开始采集工作
    if (this.action == "Start") {
      this.start()
    }

  }

  ssh_on_error(err) {
    this.ssh_status = 'error'
    this.ssh.end();
    logger.error(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_pass: this.ssh_pass,
        ssh_cmd: this.ssh_cmd,
        ssh_encoding: this.ssh_encoding,
        ssh_status: this.ssh_status,
        error: err
      },
      'Bumblebee, SSH on error'
    );
  }

  ssh_on_end() {
    this.ssh_status = 'end'
    logger.info(
      {
        bee_id: this.id,
        ssh_host: this.ssh_host,
        ssh_port: this.ssh_port,
        ssh_user: this.ssh_user,
        ssh_pass: this.ssh_pass,
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
        ssh_pass: this.ssh_pass,
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
      'Bumblebee, start'
    );

    if (this.ssh_status != 'ready') {
      logger.error(
        {
          bee_id: this.id
        },
        'Bumblebee, SSH is not ready')
      return
    }

    this.ssh.exec(this.ssh_cmd, (err, stream) => {

      if (err) throw err;

      stream
        .on('close', this.ssh_stream_on_close)
        .on('data', this.ssh_stream_on_data)
        .stderr.on('data', this.ssh_stream_stderr_on_data);

    });
  } // end of start

  ssh_stream_on_close(code, signal) {
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
          data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: this.ssh_data_buffer })

          // 按行PUB出去
          this.pub.publish(this.pub_channel, data_line)
          this.line_counter += 1
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
        data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[i] })

        // 按行PUB出去
        this.pub.publish(this.pub_channel, data_line)
        this.line_counter += 1
        this.uptime = Date.now() - this.start_ts

      }
      // 最后一行数据，如果以回车符结束，就清空缓存，否则缓存起来
      if (end_with_LF) {
        data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[lines.length - 1] })

        // 按行PUB出去
        this.pub.publish(this.pub_channel, data_line)
        this.line_counter += 1
        this.uptime = Date.now() - this.start_ts

        this.ssh_data_buffer = ''
      } else {
        this.ssh_data_buffer = lines[lines.length - 1]
      }
    }
  }

  ssh_stream_stderr_on_data(data) {
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