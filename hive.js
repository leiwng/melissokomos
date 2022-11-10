/***
 * Hive 负责启动 Bee 从远程目标机上获取数据，包括日志数据和执行 shell script 的结果数据
 * Hive 实现数据采集的自管理 self-management，包括：
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
    this.stop_bee = this.stop_bee.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
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

    // 从env中获取运行的基础设施和基本标识信息
    this.node_id = process.env.SINGED_NODE_ID;
    // 任务数上限，超过此数值，不再接受新任务
    this.task_limit = process.env.SINGED_TASK_LIMIT;
    // Redis服务访问点
    this.redis_url = process.env.SINGED_REDIS_URL;
    // 新下达任务队列名
    this.task_queue_name = process.env.SINGED_TASK_QUEUE;
    // 现有任务变更请求通道名
    this.task_chg_req_channel_name = process.env.SINGED_TASK_CHG_REQ;
    // 现有任务变更返回通道名
    this.task_chg_res_channel_name = process.env.SINGED_TASK_CHG_RES;
    // 任务状态表名
    this.task_stat_table_name = process.env.SINGED_TASK_STAT;
    // 节点状态表名
    this.node_stat_table_name = process.env.SINGED_NODE_STAT;
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

    // read node stat table for resume tasks
    try {
      this.redis = new Redis(this.redis_url);
    } catch (err) {
      logger.error(
        {
          node_id: this.node_id,
          func: "init in Constructor of Hive class",
          step: "create redis client",
          redis_url: this.redis_url,
          err: err,
        },
        "Redis connection error: "
      );
      process.exit(1);
    }
  } // end of init

  get_node_stat() {
    // get node stat
    this.redis.exists(this.node_stat_table_name).then((res) => {
      if (res == 1) {
        this.redis.hget(this.node_stat_table_name, this.node_id, (err, res) => {
          if (err) {
            logger.error(
              {
                node_id: this.node_id,
                node_stat_table_name: this.node_stat_table_name,
                func: "Hive->constructor",
                step: "找到node_stat_table_name，但是根据node_id读取node_stat失败.",
                err: err,
              },
              "节点初始化：没能根据node_id找到node_stat."
            );

            // 用节点的当前状态更新 node_stat ,并更新节点状态表 node_stat_table_name
            this.update_node_stat();

          } else {
            this.node_stat = JSON.parse(res);
            logger.info(
              {
                node_id: this.node_id,
                node_stat_table_name: this.node_stat_table_name,
                func: "Hive->constructor",
                step: "找到node_stat_table_name，根据node_id读取node_stat成功.",
                node_stat: this.node_stat,
              },
              "节点初始化：找到node_stat."
            );
          }
        });
      } else {
        this.node_stat = {};
        logger.error(
          {
            node_id: this.node_id,
            node_stat_table_name: this.node_stat_table_name,
            func: "Hive->constructor",
            step: "没找到node_stat_table_name.",
            node_stat: this.node_stat,
          },
          "节点初始化：没找到node_stat表."
        );
        // this.redis.quit();
        // logger.info(
        //   {
        //     node_id: this.node_id,
        //     node_stat_table_name: this.node_stat_table_name,
        //     func: "Hive->constructor",
        //     step: "关闭redis连接,准备退出.",
        //     node_stat: this.node_stat,
        //   },
        //   "节点初始化：关闭redis连接,准备退出."
        // );
        // process.exit(1);
      }
    });
  } // end of get_node_stat

  get_tasks_from_node_stat() {
    // get tasks from node stat

    if (Object.keys(this.node_stat).length !== 0) {
      // get node tasks from node statues table
      this.node_tasks = this.node_stat.TASK_LIST;
      logger.info(
        {
          node_id: this.node_id,
          node_stat_table_name: this.node_stat_table_name,
          func: "Hive->constructor",
          step: "从node_stat中读取node_tasks成功.",
          node_tasks: this.node_tasks,
        },
        "节点初始化：从node_stat中找到node_tasks."
      );
    } else {
      this.node_tasks = [];
      logger.info(
        {
          node_id: this.node_id,
          node_stat_table_name: this.node_stat_table_name,
          func: "Hive->constructor",
          step: "准备从node_stat中读取node_tasks，但node_stat为空.",
          node_tasks: this.node_tasks,
        },
        "节点初始化：从node_stat中没找到node_tasks."
      );
    }
  } // end of get_tasks_from_node_stat

  resume_tasks() {

    // 根据tasks生成bees
    if (this.node_tasks.length > 0) {
      // 创建bees
      this.bees = this.node_tasks.map((task) => new Bee(task));
      logger.info(
        {
          node_id: this.node_id,
          node_stat_table_name: this.node_stat_table_name,
          func: "Hive->constructor",
          step: "根据node_tasks创建bees成功.",
          bees: this.bees,
        },
        "节点初始化：根据node_stat中的tasks生成bees."
      );
      // 启动采集
      this.bees.forEach((bee) => bee.start());
      logger.info(
        {
          node_id: this.node_id,
          node_stat_table_name: this.node_stat_table_name,
          func: "Hive->constructor",
          step: "启动bees成功.",
          bees: this.bees,
        },
        "节点初始化：启动Bees恢复采集成功."
      );
    } else {
      this.bees = [];
      logger.info(
        {
          node_id: this.node_id,
          node_stat_table_name: this.node_stat_table_name,
          func: "Hive->constructor",
          step: "准备根据node_stat中的node_tasks创建bees恢复采集，但node_tasks为空.",
          bees: this.bees,
        },
        "节点初始化：没有遗留的task, bees=[]."
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
        task_queue_name: this.task_queue_name,
        func: "Hive->start",
        step: "启动chk_new_task定时器成功.",
        chk_task_interval: this.chk_task_interval,
      },
      "节点启动：开始监听任务队列."
    );

    // 设置定时更新node_stat_table
    this.update_node_stat_interval = setInterval(
      this.update_node_stat,
      this.node_stat_update_interval_ms
    );
    logger.info(
      {
        node_id: this.node_id,
        node_stat_table_name: this.node_stat_table_name,
        func: "Hive->start",
        step: "启动update_node_stat定时器成功.",
        update_node_stat_interval: this.update_node_stat_interval,
      },
      "节点启动：开始定时更新node_stat."
    );
  } // end of start

  chk_new_task() {
    if (this.bees.length < this.task_limit) {
      // 监听任务队列
      this.redis.brpop(this.task_queue_name, 0, (err, res) => {

        if (err) {
          logger.error(
            {
              node_id: this.node_id,
              task_queue_name: this.task_queue_name,
              func: "Hive->chk_new_task",
              step: "监听任务队列失败.",
              err: err,
            },
            "监听任务队列失败(task_queue_name)."
          );

          throw err;

        } else {

          // 从任务队列中取出任务
          let task = JSON.parse(res[1]);

          // 检查是否是采集任务，酿造任务需要退回队列
          if (task.TYPE == "Parser") {
            // 退回任务队列
            this.redis.lpush(this.task_queue_name, JSON.stringify(task));

            return;

          }

          logger.info(
            {
              node_id: this.node_id,
              task_queue_name: this.task_queue_name,
              func: "Hive->chk_new_task",
              step: "监听任务队列成功.",
              task: task,
            },
            "从任务队列中取出任务."
          );

          if (task.ACTION == "TaskStop") {

            // 停止任务
            stop_bee(task.TASKID);

            // 停止任务，更新node_stat
            this.update_node_stat();

          } else if (task.ACTION == "Start") {

            // 生成新的bee，完成采集任务
            const bee = new Bee(task);
            // 启动bee
            bee.start();
            // 加入bees
            this.bees.push(bee);
            logger.info(
              {
                node_id: this.node_id,
                task_queue_name: this.task_queue_name,
                func: "Hive->chk_new_task",
                step: "启动bee成功.",
                bee: bee,
              },
              "启动新bee."
            );

            // 增加新Task，启动新的Bee，更新node_stat
            this.update_node_stat();

          } else {
            logger.error(
              {
                node_id: this.node_id,
                task_queue_name: this.task_queue_name,
                func: "Hive->chk_new_task",
                step: "任务类型错误.",
                task: task,
              },
              "任务类型错误."
            );

            throw new Error("Task Type Err");

          } // end of if (task.ACTION == "TaskStop")
        } // end of 取任务
      });
    }
  } // end of chk_new_task

  update_node_stat() {

    // 更新node_stat中的node信息
    this.node_stat.NODE_ID = this.node_id
    this.node_stat.START_TS = this.start_ts
    this.node_stat.UPTIME = Date.now() - this.start_ts
    this.node_stat.TASK_LIMIT = this.task_limit
    this.node_stat.TASK_COUNT = this.bees.length
    this.node_stat.REDIS_URL = this.redis_url
    this.node_stat.TASK_QUEUE = this.task_queue_name
    this.node_stat.TASK_CHG_REQ_CHANNEL = this.task_chg_req_channel_name
    this.node_stat.TASK_CHG_RES_CHANNEL = this.task_chg_res_channel_name
    this.node_stat.TASK_STAT_TABLE = this.task_stat_table_name
    this.node_stat.NODE_STAT_TABLE = this.node_stat_table_name

    this.uptime = this.node_stat.UPTIME

    // 更新node_stat中的task信息
    if (this.bees.length > 0) {
      this.node_stat.TASK_LIST = this.bees.map((bee) => {
        return {
          ID: bee.task.TASKID,
          TYPE: bee.task.TYPE,
          NAME: bee.task.NAME,
          DESC: bee.task.DESC,

          INPUT: bee.task.INPUT,
          OUTPUT: bee.task.OUTPUT,

          STATE: bee.ssh_status,
          STATE_DESC: bee.ssh_status,
          UPTIME: bee.uptime,
          WORK_COUNT: bee.line_counter,
        };
      });
    } else {
      this.node_stat.TASK_LIST = [];
    }

    // 把node_stat更新到node_stat_table
    this.redis.hset(
      this.node_stat_table_name,
      this.node_id,
      JSON.stringify(this.node_stat),
      (err, res) => {
        if (err) {
          logger.error(
            {
              node_id: this.node_id,
              node_stat_table_name: this.node_stat_table_name,
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
              node_stat_table_name: this.node_stat_table_name,
              func: "Hive->update_node_stat",
              step: "更新node_stat成功.",
              node_stat: this.node_stat
            },
            "更新node_stat成功."
          );
        }
      }
    );
  } // end of update_node_stat

  stop_bee(bee_id) {
    // 停止Bee
    this.bees.filter((bee) => bee.id == bee_id)[0].stop();
    logger.info(
      {
        node_id: this.node_id,
        func: "Hive->stop_bee",
        bee_id: bee_id,
        step: "停止bee成功.",
        bee: this.bees.filter((bee) => bee.id == bee_id)[0],
      },
      "停止指定bee."
    );

    // 从bees中删除bee
    this.bees = this.bees.filter((bee) => bee.id != bee_id);
    logger.info(
      {
        node_id: this.node_id,
        func: "Hive->stop_bee",
        bee_id: bee_id,
        step: "从Hive中删除bee成功.",
        bees: this.bees,
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
        task_queue_name: this.task_queue_name,
        func: "Hive->stop",
        step: "Hive停止监听任务队列成功.",
        chk_task_interval: this.chk_task_interval,
      },
      "Hive停止监听任务队列."
    );

    // 停止bees
    this.bees.forEach((bee) => bee.stop());
    this.bees = [];
    logger.info(
      {
        node_id: this.node_id,
        task_queue_name: this.task_queue_name,
        func: "Hive->stop",
        step: "Hive停止所有bees成功.",
        bees: this.bees,
      },
      "停止Hive中的所有Bees."
    );

    // 删除node_stat
    this.redis.hdel(this.node_stat_table_name, this.node_id);
    logger.info(
      {
        node_id: this.node_id,
        node_stat_table_name: this.node_stat_table_name,
        task_queue_name: this.task_queue_name,
        func: "Hive->stop",
        step: "Hive删除node_stat成功.",
      },
      "节点Stop, node_stat_table中对应记录."
    );

    clearInterval(this.update_node_stat_interval);
    logger.info(
      {
        node_id: this.node_id,
        task_queue_name: this.task_queue_name,
        func: "Hive->stop",
        step: "Hive停止节点状态更新成功.",
        chk_task_interval: this.update_node_stat_interval,
      },
      "Hive停止节点状态更新."
    );

    this.redis.disconnect()

  } // end of stop

} // end of class Hive

const hive = new Hive();
hive.start();
