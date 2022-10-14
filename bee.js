const { ssh } = require('ssh2');
const Redis = require("ioredis");
const logger = require("./bee_logger")


class Bee {
    constructor(task) {

        this.id = task.ID

        this.ssh_host = task.INPUT.SSH_HOST
        this.ssh_port = task.INPUT.SSH_PORT
        this.ssh_user = task.INPUT.SSH_USER
        this.ssh_pass = task.INPUT.SSH_PASS
        this.ssh_cmd = task.INPUT.COMMAND_LINE
        this.ssh_encoding = task.INPUT.ENCODING

        this.pub = new Redis(task.OUTPUT.URL)
        this.pub_channel = task.OUTPUT.CHANNEL

        this.ssh = new ssh()
        this.ssh_data_buffer = ''
        this.ssh_status = 'disconnected'
        this.line_counter = 0

        // 部署任务
        this.ssh.on('ready', () => {

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
                    pub_channel: this.pub_channel,
                    ssh_status: this.ssh_status
                },
                'Bee, SSH on ready'
            );

        }).on('error', function (err) {
            this.ssh_status = 'error'
            this.ssh.end();
            logger.error(
                {
                    bee_id: this.id,
                    error: err
                },
                'Bee, SSH on error'
            );
        }).on('end', function () {
            this.ssh_status = 'end'
            logger.info(
                {
                    bee_id: this.id
                },
                'Bee, SSH on end');
        }).on('close', function (had_error) {
            this.ssh_status = 'closed'
            logger.info(
                {
                    bee_id: this.id
                },
                'Bee, SSH on close');
        }).on('keyboard-interactive', function (name, instructions, instructionsLang, prompts, finish) {
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
                'Bee, SSH on keyboard-interactive'
            );
        }).connect({
            host: this.ssh_host,
            port: this.ssh_port,
            username: this.ssh_user,
            password: this.ssh_pass
        });

    } // end of constructor

    start() {
        logger.info(
            {
                bee_id: this.id
            },
            'Bee, start'
        );

        if (this.ssh_status != 'ready') {
            logger.error(
                {
                    bee_id: this.id
                },
                'Bee, SSH is not ready')
            return
        }

        this.ssh.exec(this.ssh_cmd, (err, stream) => {

            if (err) throw err;

            stream.on('close', function (code, signal) {
                logger.info(
                    {
                        bee_id: this.id,
                        stream_on_close_code: code,
                        stream_on_close_signal: signal
                    },
                    'Bee, SSH Stream on close'
                );
                this.ssh.end();
            }).on('data', (data) => {

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
                        this.line_counter

                    }
                    // 最后一行数据，如果以回车符结束，就清空缓存，否则缓存起来
                    if (end_with_LF) {
                        data_line = JSON.stringify({ host: this.ssh_host, startTs: now.getTime(), msg: lines[lines.length - 1] })

                        // 按行PUB出去
                        this.pub.publish(this.pub_channel, data_line)
                        this.line_counter

                        this.ssh_data_buffer = ''
                    } else {
                        this.ssh_data_buffer = lines[lines.length - 1]
                    }
                }

            }).stderr.on('data', function (data) {
                logger.info(
                    {
                        bee_id: this.id,
                        data: data
                    },
                    'Bee, SSH Stream on stderr'
                )
            });

        });

    } // end of start

    stop() {
        logger.info(
            {
                bee_id: this.id
            },
            'Bee, stopping...'
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
            'Bee, stopped.'
        );
    } // end of stop

}; // end of class Bee

module.exports = Bee