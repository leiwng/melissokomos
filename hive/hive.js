/***
 * Hive 负责启动 Bee 从远程目标机上获取数据，包括日志数据和执行 shell script 的结果数据
 * Hive 实现数据采集的自管理 self-management，功能包括：
 * 1. 以容器运行，对自身负载进行监控，当负载过高时，自动停止接受新的采集任务
 * 2. 自动读取采集任务,并交由 Bee 执行
 * 3. 非正常终止，重启后会优先恢复现有任务，然后再获取新任务
***/
const Redis = require("ioredis");
const Bee = require("./bee");
const logger = require("./hive_logger");
require('dotenv').config()


class Hive {

  constructor() {
    // member functions
    this.init = this.init.bind(this);

    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.stop_bee = this.stop_bee.bind(this);

    this.chk_new_task = this.chk_new_task.bind(this);
    this.update_node_stat = this.update_node_stat.bind(this);

    this.get_node_stat = this.get_node_stat.bind(this);
    this.get_tasks_from_node_stat = this.get_tasks_from_node_stat.bind(this);
    this.resume_tasks = this.resume_tasks.bind(this);

    // constructor operations
    this.init();
    this.get_node_stat();
    this.get_tasks_from_node_stat();
    this.resume_tasks();

  }

  init() {

    // 节点类型, hive or cellar
    this.node_type = "hive";
    // 从env中获取运行的基础设施和基本标识信息
    this.node_id = process.env.SINGED_NODE_ID;
    // 任务数上限，超过此数值，不再接受新任务
    this.task_limit = process.env.SINGED_TASK_LIMIT;
    // Redis服务访问点
    this.redis_url = process.env.SINGED_REDIS_URL;

    // 任务下达队列
    this.task_req_queue = process.env.SINGED_TASK_REQ_QUEUE;
    // 任务返回队列
    this.task_rsp_queue = process.env.SINGED_TASK_RSP_QUEUE;

    // 节点状态任务更新表
    this.node_stat_hset = process.env.SINGED_NODE_STAT_HSET;

    // 检查新任务的时间间隔(毫秒)
    this.chk_new_task_interval_ms = process.env.SINGED_CHK_NEW_TASK_INTERVAL_MS;
    // 更新节点状态的时间间隔(毫秒)
    this.node_stat_update_interval_ms = process.env.SINGED_NODE_STAT_UPDATE_INTERVAL_MS;

    this.node_stat = {};
    this.node_tasks = [];
    this.bees = [];

    this.chk_task_interval = null;
    this.update_node_stat_interval = null;

    // 节点开始时间戳
    this.start_ts = Date.now()
    // 节点上线持续时间
    this.uptime = 0

    // create Redis Client
    try {
      this.redis = new Redis(this.redis_url);
    } catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Hive -> init",
          step: "new redis client",
          redis_url: this.redis_url,
          err: err,
        },
        "Redis connection error! node exit! "
      );
      process.exit(1);
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
                func: "Hive -> get_node_stat",
                step: "find node info in node_stat_hset",
                err: err,
              },
              `cannot find node with id: ${this.node_id} in node_stat_hset.`
            );
            // 用节点的当前状态更新 node_stat ,并更新节点状态表 node_stat_hset
            this.update_node_stat();
          } else {
            this.node_stat = JSON.parse(res);
            logger.info(
              {
                node_id: this.node_id,
                node_type: this.node_type,
                node_stat_hset: this.node_stat_hset,
                func: "Hive -> get_node_stat",
                step: "find node info in node_stat_hset",
                node_stat: this.node_stat,
              },
              `found node with id: ${this.node_id} in node_stat_hset.`
            );
          }
        });
      } else {
        this.node_stat = {};
        logger.error(
          {
            node_id: this.node_id,
            node_type: this.node_type,
            node_stat_hset: this.node_stat_hset,
            func: "Hive -> get_node_stat",
            step: "check whether node_stat_hset exist.",
            node_stat: this.node_stat,
          },
          `cannot find node state table: ${this.node_id}.`
        );
        // 没有node_stat表没太大关系,节点启动后把状态push到redis上也OK.
      }
    });
  } // end of get_node_stat

  get_tasks_from_node_stat() {
    // get tasks from node stat
    if (Object.keys(this.node_stat).length !== 0) {
      // get node tasks from node statues table
      this.node_tasks = this.node_stat.task_list.map((item) => {return item.task_content;});
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Hive -> get_tasks_from_node_stat",
          step: "从node_stat中读取node_tasks",
          node_tasks: this.node_tasks,
        },
        "Get node tasks from node_stat successfully."
      );
    } else {
      this.node_tasks = [];
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Hive -> get_tasks_from_node_stat",
          step: "从node_stat中读取node_tasks",
          node_tasks: this.node_tasks,
        },
        "node_stat is NULL."
      );
    }
  } // end of get_tasks_from_node_stat

  resume_tasks() {
    // 根据tasks生成bees
    if (this.node_tasks.length > 0) {
      // 创建bees, Bee在ssh_on_ready后会自动启动采集
      this.bees = this.node_tasks.map((task) => new Bee(task));
      // 只保留创建成功的bee.创建失败的,直接丢弃,对应的task也会被丢弃.
      this.bees = this.bees.filter((bee) => bee.health === true);
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Hive -> resume_tasks",
          step: "Generate Bees from tasks in node_stat",
          bees_length: this.bees.length,
        },
        "Generate Bees for resuming tasks in node."
      );
      // Bee在ssh_on_ready后会自动启动采集,不需要调用start()
      // this.bees.forEach((bee) => bee.start());
      // 只保留启动成功的bee.启动失败的,直接丢弃,对应的task也会被丢弃.
      // this.bees = this.bees.filter((bee) => bee.health === true);
      // logger.info(
      //   {
      //     node_id: this.node_id,
      //     node_type: this.node_type,
      //     func: "Hive->resume_tasks",
      //     step: "start Bees.",
      //     bees_length: this.bees.length,
      //   },
      //   "Bees starts completed."
      // );
    } else {
      // node_stat have no task, no need resume harvest.
      this.bees = [];
      logger.info(
        {
          node_id: this.node_id,
          node_type: this.node_type,
          func: "Hive->resume_tasks",
          step: "bees=[]",
        },
        "没有遗留的task, bees=[]."
      );
    }
  } // end of resume_tasks

  start() {
    // 听Task Queue接受新任务
    this.chk_task_interval = setInterval(
      this.chk_new_task,
      this.chk_new_task_interval_ms
    );
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        task_req_queue: this.task_req_queue,
        func: "Hive->start",
        step: "启动chk_new_task定时器",
        chk_task_interval: `${this.chk_task_interval}`,
      },
      "开始任务监听."
    );

    // 设置定时更新node_stat_table
    this.update_node_stat_interval = setInterval(
      this.update_node_stat,
      this.node_stat_update_interval_ms
    );
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        node_stat_hset: this.node_stat_hset,
        func: "Hive->start",
        step: "启动update_node_stat定时器",
        update_node_stat_interval: `${this.update_node_stat_interval}`,
      },
      "开始定时更新节点状态."
    );
  } // end of start

  chk_new_task() {
    if (this.bees.length < this.task_limit) {
      // 监听任务队列
      this.redis.blpop(this.task_req_queue, 0, (err, res) => {
        if (err) {
          logger.error(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              task_req_queue: this.task_req_queue,
              func: "Hive->chk_new_task",
              step: "监听任务队列",
              err: err,
            },
            "监听任务队列失败."
          );
          throw err;
        } else {

          // 从任务队列中取出任务
          let task = JSON.parse(res[1]);

          // 检查是否是采集任务，酿造任务需要退回队列
          if (task.node_id !== this.node_id) {
            // task is not for this node, send task back to queue
            this.redis.rpush(this.task_req_queue, JSON.stringify(task));
            return;
          }
          if (task.type === "parser") {
            // 退回任务队列
            this.redis.rpush(this.task_req_queue, JSON.stringify(task));
            return;
          }

          logger.info(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              task_req_queue: this.task_req_queue,
              func: "Hive->chk_new_task",
              step: "监听任务队列成功.",
              task_id: task.id,
              task_name: task.name
            },
            "从任务队列中取出任务."
          );

          if (task.action === "stop") {
            // 停止任务
            this.stop_bee(task.id);
            // task exec response
            this.update_task_result(task, "success", `success stop task:${task.id}.`)
            // 停止任务，更新node_stat
            this.update_node_stat();
            return
          }

          if (task.action === "start") {
            // 生成新的bee，完成采集任务
            const bee = new Bee(task);
            // Bee在ssh_on_ready后会自动启动采集,不需要调用start()
            // bee.start();
            // 加入bees
            this.bees.push(bee);
            logger.info(
              {
                node_id: this.node_id,
                node_type: this.node_type,
                task_req_queue: this.task_req_queue,
                func: "Hive->chk_new_task",
                step: "启动bee成功.",
                bee_id: bee.id,
                bee_name: bee.name
              },
              "启动新bee."
            );
            // task exec response
            this.update_task_result(task, "success", `success start task:${task.id}.`)
            // 增加新Task，启动新的Bee，更新node_stat
            this.update_node_stat();
            return
          }

          if (task.action === "chg_task_limit" && task.scope === "node") {
            // 修改任务限制
            this.task_limit = task.task_limit;
            this.update_task_result(task, "success", `success change task_limit to ${task.task_limit} on node: ${this.node_id}.`)
            this.update_node_stat();
            return
          }

          logger.error(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              task_req_queue: this.task_req_queue,
              task: task.JSON.stringify(task),
              func: "Hive->chk_new_task",
              step: "检查任务类型",
            },
            "任务类型错误."
          );
          throw new Error("Task-Type-Err");
        } // end of 取任务
      });
    }
  } // end of chk_new_task

  update_node_stat() {

    // check alive bees
    this.bees = this.bees.filter((bee) => bee.health === true)

    // 更新node_stat中的node信息
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

    // 更新node_stat中的task信息
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
      });
    } else {
      this.node_stat.task_list = [];
    }

    // 把node_stat更新到node_stat_table
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
              func: "Hive->update_node_stat",
              step: "更新node_stat失败.",
              err: err
            },
            "更新node_stat失败."
          );
        } else {
          logger.info(
            {
              node_id: this.node_id,
              node_type: this.node_type,
              node_stat_hset: this.node_stat_hset,
              node_state: JSON.stringify(this.node_stat),
              func: "Hive->update_node_stat",
              step: "更新node_stat成功.",
              hset_response: res
            },
            "更新node_stat成功."
          );
        }
      }
    );
  } // end of update_node_stat

  stop_bee(bee_id) {

    // 停止bee
    bee_need_stop = this.bees.filter((bee) => bee.id === bee_id)[0]
    bee_need_stop.stop();

    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Hive->stop_bee",
        step: "停止bee成功.",
        bee_id: bee_id,
        stopped_bee_name: bee_need_stop.name,
      },
      "停止指定bee."
    );

    // 从bees中删除bee
    this.bees = this.bees.filter((bee) => bee.id !== bee_id);
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Hive->stop_bee",
        step: "从Hive中删除bee成功.",
        bee_id: bee_id,
        removed_bee_name: bee_need_stop.name,
      },
      "Bee停止后从Hive中删除."
    );
  } // end of stop_bee

  stop() {
    // 停止监听任务队列
    clearInterval(this.chk_task_interval);
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Hive->stop",
        step: "停止监听任务队列"
      },
      "停止监听任务队列完成."
    );

    // 停止bees
    this.bees.forEach((bee) => bee.stop());
    this.bees = [];
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Hive->stop",
        step: "Hive停止所有采集Bees",
        bees_length: this.bees.length
      },
      "停止所有采集Bees."
    );

    // 删除node_stat
    this.redis.hdel(this.node_stat_hset, this.node_id);
    logger.info(
      {
        node_id: this.node_id,
        node_stat_hset: this.node_stat_hset,
        func: "Hive->stop",
        step: "删除node_stat_hset"
      },
      "删除node_stat_hset完成."
    );

    clearInterval(this.update_node_stat_interval);
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Hive->stop",
        step: "停止节点状态更新"
      },
      "停止节点状态更新完成."
    );
    this.redis.disconnect()
    logger.info(
      {
        node_id: this.node_id,
        node_type: this.node_type,
        func: "Hive->stop",
        step: "Redis Disconnect"
      },
      "Redis Disconnected."
    );
  } // end of stop

  update_task_result(task, result, desc) {
    this.redis.rpush(this.task_rsp_queue, JSON.stringify(
      {
        "task": task,
        "result": result,
        "result_desc": desc
      }
    ));
    return
  }

} // end of class Hive

const hive = new Hive();
hive.start();
