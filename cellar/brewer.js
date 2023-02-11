/***
 * Brewer 负责通过 ssh 通道从远程目标机上被动获取日志数据
 * Brewer 实现数据采集的自管理 self-management，包括：
 * 1. 以容器运行，对自身负载进行监控，当负载过高时，自动 Stop 接受新的采集任务
 * 2. 自动读取采集任务,并交由 Brewer 执行
 * 3. 非正常终止，重启后会优先恢复现有任务，然后再获取新任务
***/
const logger = require("./brewer_logger")
const { fork } = require("node:child_process")

class Brewer {
    constructor(task, node_id, node_type) {
        // member function
        this.init = this.init.bind(this)
        this.start = this.start.bind(this)
        this.stop = this.stop.bind(this)
        this.on_recipe_stopped = this.on_recipe_stopped.bind(this)

        // 根据任务参数初始化对象属性
        this.init(task, node_id, node_type)
    } // end of constructor

    init(task, node_id, node_type) {
        this.set_state(true, "init")

        this.task = task
        this.node_id = node_id
        this.node_type = node_type

        this.id = task.id
        this.name = task.name
        this.action = task.action
        this.desc = task.desc
        this.recipe = task.recipe

        this.start_ts = Date.now()
        this.uptime = 0

        this.set_state(true, "running")

        process.on("stopped", this.on_recipe_stopped)

        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                brewer_id: this.id,
                task: JSON.stringify(task)
            },
            "Brewer, init finished"
        )
    } // end of init

    start() {
        this.recipe = fork(this.recipe, [this.task.in.redis_url, this.task.in.redis_sub_ch, this.task.out.redis_url, this.task.out.redis_pub_ch, this.node_id, this.node_type])
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                brewer_id: this.id
            },
            "Brew, starting..."
        )
    } // end of start

    stop() {
        this.set_state(false, "stopping")

        if (this.recipe) {
            this.recipe.send("stop")
        }
    } // end of stop

    on_recipe_stopped() {
        this.set_state(false, "stopped")
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                brewer_id: this.id
            },
            "Brew, Stopped"
        )
    } // end of on_recipe_stopped

    set_state(health, state) {
        this.health = health
        this.state = state
    } // end of set_status

} // end of class Brewer

module.exports = Brewer