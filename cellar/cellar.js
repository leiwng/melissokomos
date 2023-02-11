/***
 * Cellar 酿房，Brewer酿造蜂蜜的地方。 Brewer根据recipe酿造蜂蜜。
 * Recipe是酿造秘方的抽象，每一种密有单独的酿方。
***/

const Redis = require("ioredis")
const Brewer = require("./brewer_old")
const logger = require("./cellar_logger")
require("dotenv").config()


class Cellar {

    constructor() {
    // member functions
        this.init = this.init.bind(this)

        this.start = this.start.bind(this)
        this.stop = this.stop.bind(this)
        this.stop_brew = this.stop_brew.bind(this)

        this.chk_new_task = this.chk_new_task.bind(this)
        this.update_node_stat = this.update_node_stat.bind(this)
        this.update_task_result = this.update_task_result.bind(this)

        this.get_node_stat = this.get_node_stat.bind(this)
        this.get_tasks_from_node_stat = this.get_tasks_from_node_stat.bind(this)
        this.resume_tasks = this.resume_tasks.bind(this)

        // constructor operations
        this.init()
        this.get_node_stat()
        this.get_tasks_from_node_stat()
        this.resume_tasks()
    }

    init() {
        // node type , hive or cellar
        this.node_type = "cellar"
        // 从env中获取运行的基础设施和基本标识信息
        this.node_id = process.env.SINGED_NODE_ID
        // 任务数上限，超过此数值，不再接受新任务
        this.task_limit = process.env.SINGED_TASK_LIMIT
        // Redis服务访问点
        this.redis_url = process.env.SINGED_REDIS_URL

        // 任务下达队列
        this.task_req_queue = process.env.SINGED_TASK_REQ_QUEUE
        // 任务返回队列
        this.task_rsp_queue = process.env.SINGED_TASK_RSP_QUEUE

        // node 状态任务 Update 表
        this.node_stat_hset = process.env.SINGED_NODE_STAT_HSET

        // 检查新任务的时间间隔(毫秒)
        this.chk_new_task_interval_ms = process.env.SINGED_CHK_NEW_TASK_INTERVAL_MS
        //  Update node 状态的时间间隔(毫秒)
        this.node_stat_update_interval_ms = process.env.SINGED_NODE_STAT_UPDATE_INTERVAL_MS

        this.node_stat = {}
        this.node_tasks = []
        this.brewers = []

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
            logger.error(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar -> init",
                    step: "new redis client",
                    redis_url: this.redis_url,
                    err: err,
                },
                "Redis connection error! node exit! "
            )
            process.exit(1)
        }
    } // end of init

    get_node_stat() {
    // get node stat
        this.redis.exists(this.node_stat_hset).then((res) => {
            if (res == 1) {
                this.redis.hget(this.node_stat_hset, this.node_id, (err, res) => {
                    if (err) {
                        logger.error(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                node_stat_hset: this.node_stat_hset,
                                func: "Cellar -> get_node_stat",
                                step: "find node info in node_stat_hset",
                                err: err,
                            },
                            `cannot find node with id: ${this.node_id} in node_stat_hset.`
                        )
                        // 用node 的当前state update node_stat ,并 Update node 状态表 node_stat_hset
                        this.update_node_stat()
                    } else {
                        // get node state from node_stat_hset.
                        this.node_stat = JSON.parse(res)
                        logger.info(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                node_stat_hset: this.node_stat_hset,
                                func: "Cellar -> get_node_stat",
                                step: "find node info in node_stat_hset",
                                node_stat: this.node_stat,
                            },
                            `found node with id: ${this.node_id} in node_stat_hset.`
                        )
                    }
                })
            } else {
                this.node_stat = {}
                logger.error(
                    {
                        node_id: this.node_id,
                        node_type: this.node_type,
                        node_stat_hset: this.node_stat_hset,
                        func: "Cellar -> get_node_stat",
                        step: "check whether node_stat_hset exist.",
                        node_stat: this.node_stat,
                    },
                    `cannot find node state table: ${this.node_id}.`
                )
                // 没有node_stat表没太大关系,node Start 后把状态push到redis上也OK.
            }
        })
    } // end of get_node_stat

    get_tasks_from_node_stat() {
    // get tasks from node stat
        if (Object.keys(this.node_stat).length !== 0) {
            // get node tasks from node statues table
            this.node_tasks = this.node_stat.task_list.map((item) => {return item.task_content})
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar -> get_tasks_from_node_stat",
                    step: "从node_stat中读取node_tasks",
                    node_tasks: this.node_tasks,
                },
                "Get node tasks from node_stat successfully."
            )
        } else {
            this.node_tasks = []
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar -> get_tasks_from_node_stat",
                    step: "从node_stat中读取node_tasks",
                    node_tasks: this.node_tasks,
                },
                "node_stat is NULL."
            )
        }
    } // end of get_tasks_from_node_stat

    resume_tasks() {
    // 根据tasks生成brewers
        if (this.node_tasks.length > 0) {
            // 创建brewers, brewer在ssh_on_ready后会自动Start 酿造
            this.brewers = this.node_tasks.map((task) => new Brewer(task, this.node_id, this.node_type))
            // 只保留创建Success的brewer.fail 的,直接丢弃,对应的task也会被丢弃.
            this.brewers = this.brewers.filter((brewer) => brewer.health === true)
            // start brewers
            this.brewers.forEach((brewer) => brewer.start())
            // 只保留SuccessStart 的brewer.fail 的,直接丢弃,对应的task也会被丢弃.
            this.brewers = this.brewers.filter((brewer) => brewer.health === true)
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar -> resume_tasks",
                    step: "Generate brewers from tasks in node_stat",
                    brewers_length: this.brewers.length,
                },
                "Generate brewers for resuming tasks in node."
            )
            // brewer在ssh_on_ready后会自动Start 酿造,不需要调用start()
            // this.brewers.forEach((brewer) => brewer.start());
            // 只保留Start Success的brewer.Start fail 的,直接丢弃,对应的task也会被丢弃.
        } else {
            // node_stat have no task, no need resume harvest.
            this.brewers = []
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar->resume_tasks",
                    step: "brewers=[]",
                },
                "没有遗留的task, brewers=[]."
            )
        }
    } // end of resume_tasks

    start() {
    // 听task-queue接受新任务
        this.chk_task_interval = setInterval(
            this.chk_new_task,
            this.chk_new_task_interval_ms
        )
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                task_req_queue: this.task_req_queue,
                func: "Cellar->start",
                step: "Start chk_new_task定时器",
                chk_task_interval: `${this.chk_task_interval}`,
            },
            "开始任务监听."
        )

        // 设置定时 Update node_stat_table
        this.update_node_stat_interval = setInterval(
            this.update_node_stat,
            this.node_stat_update_interval_ms
        )
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                node_stat_hset: this.node_stat_hset,
                func: "Cellar->start",
                step: "Set update_node_stat_interval",
                update_node_stat_interval: `${this.update_node_stat_interval}`,
            },
            "开始定时 Update node 状态."
        )
    } // end of start

    chk_new_task() {
    // listen to task-queue
        this.redis.blpop(this.task_req_queue, 0, (err, res) => {
            if (err) {
                logger.error(
                    {
                        node_id: this.node_id,
                        node_type: this.node_type,
                        task_req_queue: this.task_req_queue,
                        func: "Cellar->chk_new_task",
                        step: "listen to task-queue",
                        err: err,
                    },
                    "listen to task-queue fail ."
                )
                throw err
            } else {

                // 从任务队列中取出任务
                let task = JSON.parse(res[1])

                if (task.type !== "parser") {
                    // 退回任务队列
                    this.redis.rpush(this.task_req_queue, JSON.stringify(task))
                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            task_id: task.id,
                            task_type: task.type,
                            task_action: task.action,
                            task_name: task.name,
                            task_desc: task.desc,
                            func: "Cellar->chk_new_task",
                            step: "非Parser任务",
                        },
                        "非Parser任务,退回任务队列."
                    )
                    return
                }

                if (task.node_id === this.node_id
                    && task.scope === "task"
                    && task.action === "stop") {
                    //  Stop 任务
                    this.stop_brew(task.id)
                    // task exec response
                    this.update_task_result(task, "success", `success stop task:${task.id}.`)
                    //  Stop 任务， Update node_stat
                    this.update_node_stat()
                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            task_id: task.id,
                            task_type: task.type,
                            task_action: task.action,
                            task_name: task.name,
                            task_desc: task.desc,
                            func: "Cellar->chk_new_task",
                            step: "Task Stop任务",
                        },
                        "Task Stop任务,处理完毕."
                    )
                    return
                }

                if (task.node_id === this.node_id
                    && task.scope === "node"
                    && task.action === "chg_task_limit") {
                    // 修改任务限制
                    this.task_limit = task.task_limit
                    this.update_task_result(task, "success", `success change task_limit to ${task.task_limit} on node: ${this.node_id}.`)
                    this.update_node_stat()
                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            task_id: task.id,
                            task_type: task.type,
                            task_action: task.action,
                            task_name: task.name,
                            task_desc: task.desc,
                            func: "Cellar->chk_new_task",
                            step: "chg_task_limit任务",
                        },
                        "chg_task_limit任务,处理完毕."
                    )
                    return
                }

                if (task.action === "start") {
                    if (this.brewers.length >= this.task_limit) {
                        // 任务数已经达到限制，退回任务队列
                        this.redis.rpush(this.task_req_queue, JSON.stringify(task))
                        logger.info(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                task_id: task.id,
                                task_type: task.type,
                                task_action: task.action,
                                task_name: task.name,
                                task_desc: task.desc,
                                func: "Cellar->chk_new_task",
                                step: "任务数已经达到限制，退回任务队列."
                            },
                            "任务数已经达到限制，退回任务队列."
                        )
                        return
                    }

                    // 生成新的brewer， finish 酿造任务
                    const brewer = new Brewer(task, this.node_id, this.node_type)
                    brewer.start
                    if (brewer.health) {
                        this.brewers.push(brewer)
                        logger.info(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                task_id: task.id,
                                task_type: task.type,
                                task_action: task.action,
                                task_name: task.name,
                                task_desc: task.desc,
                                func: "Cellar->chk_new_task",
                                step: "Start Brewer."
                            },
                            "SuccessStart Brewer."
                        )
                    }
                    // task exec response
                    this.update_task_result(task, "success", `success start task:${task.id}.`)
                    // 增加新Task，Start 新的brewer， Update node_stat
                    this.update_node_stat()
                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            task_id: task.id,
                            task_type: task.type,
                            task_action: task.action,
                            task_name: task.name,
                            task_desc: task.desc,
                            brewer_id: brewer.id,
                            brewer_name: brewer.name,
                            func: "Cellar->chk_new_task",
                            step: "Start brewerSuccess.",
                        },
                        "Start 新brewer."
                    )
                    return
                } // end of if (task.action === "start")

                // other cases, send task back
                this.redis.rpush(this.task_req_queue, JSON.stringify(task))
                logger.info(
                    {
                        node_id: this.node_id,
                        node_type: this.node_type,
                        task_id: task.id,
                        task_type: task.type,
                        task_action: task.action,
                        task_name: task.name,
                        task_desc: task.desc,
                        func: "Cellar->chk_new_task",
                        step: "取到超出处理能力的任务",
                    },
                    "取到超出处理能力的任务，退回任务队列."
                )
                return
            } // end of 取任务
        })
    } // end of chk_new_task

    update_node_stat() {

        // check alive brewers
        this.brewers = this.brewers.filter((brewer) => brewer.health === true)

        //  Update node_stat中的node信息
        this.node_stat.id = this.node_id
        this.node_stat.type = this.node_type
        this.node_stat.start_ts = this.start_ts
        this.node_stat.uptime = Date.now() - this.start_ts
        this.node_stat.task_limit = this.task_limit
        this.node_stat.task_count = this.brewers.length
        this.node_stat.redis_url = this.redis_url
        this.node_stat.task_req_queue = this.task_req_queue
        this.node_stat.task_rsq_queue = this.task_rsp_queue
        this.node_stat.node_stat_hset = this.node_stat_hset

        this.uptime = this.node_stat.uptime

        //  Update node_stat中的task信息
        if (this.brewers.length > 0) {
            this.node_stat.task_list = this.brewers.map((brewer) => {
                return {
                    "task_content": brewer.task,
                    "task_state": {
                        "state": brewer.state,
                        "state_desc": brewer.state,
                        "start_ts": brewer.start_ts,
                        "uptime": Date.now() - brewer.start_ts,
                        "work_count": brewer.line_count,
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
                    logger.error(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            node_stat_hset: this.node_stat_hset,
                            node_state: JSON.stringify(this.node_stat),
                            func: "Cellar->update_node_stat",
                            step: " Update node_stat",
                            err: err
                        },
                        " Update node_stat."
                    )
                } else {
                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            node_stat_hset: this.node_stat_hset,
                            node_state: JSON.stringify(this.node_stat),
                            func: "Cellar->update_node_stat",
                            step: " Update node_statSuccess.",
                            hset_response: res
                        },
                        " Update node_statSuccess."
                    )
                }
            }
        )
    } // end of update_node_stat

    stop_brew(brewer_id) {
        //  Stop brewer
        const brewer_need_stop = this.brewers.filter((brewer) => brewer.id === brewer_id)[0]
        if (brewer_need_stop) {
            brewer_need_stop.stop()
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar->stop_brew",
                    step: " Stop brewer Success.",
                    brewer_id: brewer_id,
                    stopped_brewer_name: brewer_need_stop.name,
                },
                " Stop brewer success."
            )

            // 从brewers中删除brewer
            this.brewers = this.brewers.filter((brewer) => brewer.id !== brewer_id)
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    func: "Cellar->stop_brew",
                    step: "del brewer from hive.",
                    brewer_id: brewer_id,
                    removed_brewer_name: brewer_need_stop.name,
                },
                "Stop brew and del brewer from hive."
            )
        }
    } // end of stop_brew

    stop() {
    //  Stop listen to task-queue
        clearInterval(this.chk_task_interval)
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                func: "Cellar->stop",
                step: " Stop listen to task-queue"
            },
            " Stop listen to task-queue finish ."
        )

        //  Stop brewers
        this.brewers.forEach((brewer) => brewer.stop())
        this.brewers = []
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                func: "Cellar->stop",
                step: "Hive Stop  all brewers",
                brewers_length: this.brewers.length
            },
            " Stop  all Brewers."
        )

        // 删除node_stat
        this.redis.hdel(this.node_stat_hset, this.node_id)
        logger.info(
            {
                node_id: this.node_id,
                node_stat_hset: this.node_stat_hset,
                func: "Cellar->stop",
                step: "删除node_stat_hset"
            },
            "删除node_stat_hset finish ."
        )

        clearInterval(this.update_node_stat_interval)
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                func: "Cellar->stop",
                step: " Stop node state update"
            },
            " Stop node state update finish ."
        )


        this.redis.disconnect()
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                func: "Cellar->stop",
                step: "Redis Disconnect"
            },
            "Redis Disconnected."
        )
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

} // end of class Cellar

const cellar = new Cellar()
cellar.start()
