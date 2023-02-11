/***
 * Brewer 根据特定的 Recipe 来酿造 Honey
 * Brewer 实现 Honey 酿造的自管理 self-management，功能包括：
 * 1. 以容器运行，对自身负载进行监控，当负载过高时，自动 Stop 接受新的酿造任务
 * 2. 自动读取酿造任务,并执行特定的 Recipe  finish  Honey 的酿造
 * 3. 非正常终止，重启后会优先恢复现有任务，然后再获取新任务
***/
const Redis = require("ioredis")
const Recipe = require("./recipe")
const logger = require("./brewer_logger")
require("dotenv").config()

class Brewer {
    constructor() {
    // member functions
        this.init = this.init.bind(this)
        this.start = this.start.bind(this)
        this.stop = this.stop.bind(this)
        this.stop_recipe = this.stop_recipe.bind(this)

        this.chk_new_task = this.chk_new_task.bind(this)
        this.update_node_stat = this.update_node_stat.bind(this)

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
    // node type , Collector or Parser
        this.node_type = "Parser"

        // 从env中获取运行的基础设施和基本标识信息
        this.node_id = process.env.SINGED_NODE_ID
        // 任务数上限，超过此数值，不再接受新任务
        this.task_limit = process.env.SINGED_TASK_LIMIT
        // Redis服务访问点
        this.redis_url = process.env.SINGED_REDIS_URL
        // 新下达任务队列名
        this.task_queue_name = process.env.SINGED_TASK_QUEUE
        // 现有任务变更请求通道名
        this.task_chg_req_channel_name = process.env.SINGED_TASK_CHG_REQ_CH
        // 现有任务变更返回通道名
        this.task_chg_res_channel_name = process.env.SINGED_TASK_RETURN_QUEUE
        // 任务状态表名
        this.task_stat_table_name = process.env.SINGED_TASK_STAT_HSET
        // node 状态表名
        this.node_stat_table_name = process.env.SINGED_NODE_STAT_HSET
        // 检查新任务的时间间隔(毫秒)
        this.chk_new_task_interval_ms = process.env.SINGED_CHK_NEW_TASK_INTERVAL_MS
        //  Update node 状态的时间间隔(毫秒)
        this.node_stat_update_interval_ms = process.env.SINGED_NODE_STAT_UPDATE_INTERVAL_MS

        this.node_stat = {}
        this.node_tasks = []
        this.recipes = []

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
                    func: "init in Constructor of Brewer class",
                    step: "create redis client",
                    redis_url: this.redis_url,
                    err: err,
                },
                "Redis connection error: "
            )
            process.exit(1)
        }

    } // end of init()

    get_node_stat() {
    // get node stat
        this.redis.exists(this.node_stat_table_name).then((res) => {
            if (res == 1) {
                this.redis.hget(this.node_stat_table_name, this.node_id, (err, res) => {
                    if (err) {
                        logger.error(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                node_stat_table_name: this.node_stat_table_name,
                                func: "get_node_stat",
                                step: "找到node_stat_table_name，但是根据node_id读取node_statfail .",
                                err: err,
                            },
                            "node 初始化：没能根据node_id找到node_stat."
                        )

                        // 用node 的当前state update node_stat ,并 Update node 状态表 node_stat_table_name
                        this.update_node_stat()

                    } else {
                        this.node_stat = JSON.parse(res)
                        logger.info(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                node_stat_table_name: this.node_stat_table_name,
                                func: "get_node_stat",
                                step: "找到node_stat_table_name，根据node_id读取node_statSuccess.",
                                node_stat: this.node_stat,
                            },
                            "node 初始化：找到node_stat."
                        )
                    }
                })
            } else {
                this.node_stat = {}
                logger.error(
                    {
                        node_id: this.node_id,
                        node_type: this.node_type,
                        node_stat_table_name: this.node_stat_table_name,
                        func: "get_node_stat",
                        step: "没找到node_stat_table_name.",
                        node_stat: this.node_stat,
                    },
                    "node 初始化：没找到node_stat表."
                )
                // 没有node_stat表没太大关系,node Start 后把状态push到redis上也OK.
            }
        })
    } // end of get_node_stat

    get_tasks_from_node_stat() {
    // get tasks from node stat
        if (Object.keys(this.node_stat).length !== 0) {
            // get node tasks from node statues table
            this.node_tasks = this.node_stat.TASK_LIST
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    node_stat_table_name: this.node_stat_table_name,
                    func: "get_tasks_from_node_stat",
                    step: "从node_stat中读取node_tasksSuccess.",
                    node_tasks: this.node_tasks,
                },
                "node 初始化：从node_stat中找到node_tasks."
            )
        } else {
            this.node_tasks = []
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    node_stat_table_name: this.node_stat_table_name,
                    func: "get_tasks_from_node_stat",
                    step: "准备从node_stat中读取node_tasks，但node_stat为空.",
                    node_tasks: this.node_tasks,
                },
                "node 初始化：从node_stat中没找到node_tasks."
            )
        }
    } // end of get_tasks_from_node_stat

    resume_tasks() {
    // 根据tasks找到对应的recipe,并执行
        if (this.node_tasks.length > 0) {
            // 创建recipes
            this.recipes = this.node_tasks.map((task) => new Recipe(task))
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    node_stat_table_name: this.node_stat_table_name,
                    func: "resume_tasks",
                    step: "根据node_tasks创建recipesSuccess.",
                    recipes_length: this.recipes.length,
                },
                "node 初始化：根据node_stat中的tasks生成recipes."
            )
            // Start 酿造
            this.recipes.forEach((recipe) => recipe.start())
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    node_stat_table_name: this.node_stat_table_name,
                    func: "resume_tasks",
                    step: "Start recipesSuccess.",
                    recipes_length: this.recipes.length,
                },
                "node 初始化：Start Recipes恢复酿造Success."
            )
        } else {
            this.recipes = []
            logger.info(
                {
                    node_id: this.node_id,
                    node_type: this.node_type,
                    node_stat_table_name: this.node_stat_table_name,
                    func: "resume_tasks",
                    step: "准备根据node_stat中的node_tasks创建recipes恢复酿造，但node_tasks为空.",
                    recipes_length: this.recipes.length,
                },
                "node 初始化：没有遗留的task, recipes=[]."
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
                task_queue_name: this.task_queue_name,
                func: "Hive->start",
                step: "Start chk_new_task定时器Success.",
                chk_task_interval: "this.chk_task_interval",
            },
            "node Start ：开始listen to task-queue."
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
                node_stat_table_name: this.node_stat_table_name,
                func: "Hive->start",
                step: "Start update_node_stat定时器Success.",
                update_node_stat_interval: "this.update_node_stat_interval",
            },
            "node Start ：开始定时 Update node_stat."
        )
    } // end of start

    chk_new_task() {
        if (this.recipes.length < this.task_limit) {
            // listen to task-queue
            this.redis.brpop(this.task_queue_name, 0, (err, res) => {

                if (err) {
                    logger.error(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            task_queue_name: this.task_queue_name,
                            func: "Hive->chk_new_task",
                            step: "listen to task-queue fail .",
                            err: err,
                        },
                        "listen to task-queue fail (task_queue_name)."
                    )

                    throw err

                } else {

                    // 从任务队列中取出任务
                    let task = JSON.parse(res[1])

                    // 检查是否是酿造任务，酿造任务需要退回队列
                    if (task.TYPE != "Parser") {
                        // 退回任务队列
                        this.redis.lpush(this.task_queue_name, JSON.stringify(task))
                        return
                    }

                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            task_queue_name: this.task_queue_name,
                            func: "Hive->chk_new_task",
                            step: "listen to task-queueSuccess.",
                            id: task.id,
                            task_name: task.name
                        },
                        "从任务队列中取出任务."
                    )

                    if (task.action == "TaskStop") {

                        //  Stop 任务
                        this.stop_recipe(task.id)

                        //  Stop 任务， Update node_stat
                        this.update_node_stat()

                    } else if (task.action == "Start") {

                        // 生成新的recipe， finish 酿造任务
                        const recipe = new Recipe(task)

                        // Start recipe
                        // 不由外部来Start Recipe开始工作，有Recipe内部根据TASK的内容和当前情况决定是否start work
                        // recipe.start();

                        // 加入recipes
                        this.recipes.push(recipe)

                        logger.info(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                task_queue_name: this.task_queue_name,
                                func: "Hive->chk_new_task",
                                step: "Start recipeSuccess.",
                                recipe_id: recipe.id,
                                recipe_name: recipe.name
                            },
                            "Start 新recipe."
                        )

                        // 增加新Task，Start 新的Recipe， Update node_stat
                        this.update_node_stat()

                    } else {
                        logger.error(
                            {
                                node_id: this.node_id,
                                node_type: this.node_type,
                                task_queue_name: this.task_queue_name,
                                func: "Hive->chk_new_task",
                                step: "任务type 错误.",
                                id: task.id,
                                task_name: task.name
                            },
                            "任务type 错误."
                        )

                        throw new Error("Task Type Err")

                    } // end of if (task.action == "TaskStop")
                } // end of 取任务
            })
        }
    } // end of chk_new_task

    update_node_stat() {

        //  Update node_stat中的node信息
        this.node_stat.NODE_ID = this.node_id
        this.node_stat.NODE_TYPE = this.node_type
        this.node_stat.START_TS = this.start_ts
        this.node_stat.UPTIME = Date.now() - this.start_ts
        this.node_stat.TASK_LIMIT = this.task_limit
        this.node_stat.TASK_COUNT = this.recipes.length
        this.node_stat.REDIS_URL = this.redis_url
        this.node_stat.TASK_QUEUE = this.task_queue_name
        this.node_stat.TASK_CHG_REQ_CHANNEL = this.task_chg_req_channel_name
        this.node_stat.TASK_CHG_RES_CHANNEL = this.task_chg_res_channel_name
        this.node_stat.TASK_STAT_TABLE = this.task_stat_table_name
        this.node_stat.NODE_STAT_TABLE = this.node_stat_table_name

        this.uptime = this.node_stat.UPTIME

        //  Update node_stat中的task信息
        if (this.recipes.length > 0) {
            this.node_stat.TASK_LIST = this.recipes.map((recipe) => {
                return {
                    ID: recipe.task.id,
                    TYPE: recipe.task.TYPE,
                    NAME: recipe.task.name,
                    DESC: recipe.task.desc,

                    INPUT: recipe.task.INPUT,
                    OUTPUT: recipe.task.OUTPUT,

                    STATE: recipe.ssh_status,
                    STATE_DESC: recipe.ssh_status,
                    UPTIME: recipe.uptime,
                    WORK_COUNT: recipe.line_counter,
                }
            })
        } else {
            this.node_stat.TASK_LIST = []
        }

        // 把node_stat Update 到node_stat_table
        this.redis.hset(
            this.node_stat_table_name,
            this.node_id,
            JSON.stringify(this.node_stat),
            (err, res) => {
                if (err) {
                    logger.error(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            node_stat_table_name: this.node_stat_table_name,
                            func: "Hive->update_node_stat",
                            step: " Update node_statfail .",
                            err: err
                        },
                        " Update node_statfail ."
                    )
                } else {
                    logger.info(
                        {
                            node_id: this.node_id,
                            node_type: this.node_type,
                            node_stat_table_name: this.node_stat_table_name,
                            func: "Hive->update_node_stat",
                            step: " Update node_statSuccess.",
                            node_stat: this.node_stat,
                            hset_response: res
                        },
                        " Update node_statSuccess."
                    )
                }
            }
        )
    } // end of update_node_stat

    stop_recipe(recipe_id) {

        //  Stop Recipe
        const recipe_need_stop = this.recipes.filter((recipe) => recipe.id == recipe_id)[0]
        recipe_need_stop.stop()

        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                func: "Hive->stop_recipe",
                step: " Stop recipeSuccess.",
                recipe_id: recipe_id,
                recipe_name: recipe_need_stop.name,
            },
            " Stop recipe."
        )

        // 从recipes中删除recipe
        this.recipes = this.recipes.filter((recipe) => recipe.id != recipe_id)
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                func: "Hive->stop_recipe",
                step: "从Hive中删除recipeSuccess.",
                recipe_id: recipe_id,
                recipes_name: this.recipes.name,
            },
            "Recipe Stop 后从Hive中删除."
        )
    } // end of stop_recipe

    stop() {
    //  Stop listen to task-queue
        clearInterval(this.chk_task_interval)
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                task_queue_name: this.task_queue_name,
                func: "Hive->stop",
                step: "Hive Stop listen to task-queueSuccess.",
                chk_task_interval: "this.chk_task_interval",
            },
            "Hive Stop listen to task-queue."
        )

        //  Stop recipes
        this.recipes.forEach((recipe) => recipe.stop())
        this.recipes = []
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                task_queue_name: this.task_queue_name,
                func: "Hive->stop",
                step: "Hive Stop  all recipesSuccess.",
                recipes_length: this.recipes.length,
            },
            " Stop Hive中的 all Recipes."
        )

        // 删除node_stat
        this.redis.hdel(this.node_stat_table_name, this.node_id)
        logger.info(
            {
                node_id: this.node_id,
                node_stat_table_name: this.node_stat_table_name,
                task_queue_name: this.task_queue_name,
                func: "Hive->stop",
                step: "Hive删除node_statSuccess.",
            },
            "node Stop, node_stat_table中对应记录."
        )

        clearInterval(this.update_node_stat_interval)
        logger.info(
            {
                node_id: this.node_id,
                node_type: this.node_type,
                task_queue_name: this.task_queue_name,
                func: "Hive->stop",
                step: "Hive Stop node state updateSuccess.",
                chk_task_interval: "this.update_node_stat_interval",
            },
            "Hive Stop node state update."
        )

        this.redis.disconnect()

    } // end of stop

} // end of class Brewer

const brewer = new Brewer()
brewer.start()