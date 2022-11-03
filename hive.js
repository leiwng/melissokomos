const Redis = require("ioredis");
const Bee = require("./bee");
const logger = require("./hive_logger");

class Hive {
  constructor() {
    // get env
    this.node_id = process.env.SINGED_NODE_ID;
    this.task_limit = process.env.SINGED_TASK_LIMIT;
    this.redis_url = process.env.SINGED_REDIS_URL;
    this.task_queue_name = process.env.SINGED_TASK_QUEUE;
    this.task_chg_req_channel_name = process.env.SINGED_TASK_CHG_REQ;
    this.task_chg_res_channel_name = process.env.SINGED_TASK_CHG_RES;
    this.task_stat_table_name = process.env.SINGED_TASK_STAT;
    this.node_stat_table_name = process.env.SINGED_NODE_STAT;
    this.chk_task_interval_time = process.env.SINGED_CHK_TASK_INTERVAL;
    this.update_node_stat_interval_time = process.env.SINGED_UPDATE_NODE_STAT_INTERVAL;

    this.node_stat = {};
    this.node_tasks = [];
    this.bees = [];

    this.chk_task_interval = null;
    this.update_node_stat_interval = null;
    this.start_timestamp = Math.floor(Date.now() / 1000)
    this.uptime = 0

    // read node stat table for resume tasks
    this.redis = new Redis(this.redis_url);

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

            // 找不到旧的node_stat, 生成新的node_stat
            this.node_stat = {
              NODE_ID: this.node_id,
              UPTIME: 0,
              TASK_LIMIT: this.task_limit,
              TASK_COUNT: 0,
              REDIS_URL: this.redis_url,
              TASK_QUEUE: this.task_queue_name,
              TASK_CHG_REQ_CHANNEL: this.task_chg_req_channel_name,
              TASK_CHG_RES_CHANNEL: this.task_chg_res_channel_name,
              TASK_STAT_TABLE: this.task_stat_table_name,
              NODE_STAT_TABLE: this.node_stat_table_name,
              TASK_LIST: []
            };
            // 在node_stat_table中，没有找到node_id, 更新TASK_LIST为空的node_stat到node_stat_table
            update_node_stat();

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
          "节点初始化：没找到node_stat表,系统运行设置不正确."
        );
        this.redis.quit();
        logger.info(
          {
            node_id: this.node_id,
            node_stat_table_name: this.node_stat_table_name,
            func: "Hive->constructor",
            step: "关闭redis连接,准备退出.",
            node_stat: this.node_stat,
          },
          "节点初始化：关闭redis连接,准备退出."
        );
        process.exit(1);
      }
    });

    // get tasks from node stat
    if (this.node_stat != {}) {
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

    // 根据tasks生成bees
    if (this.node_tasks != []) {
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
  } // end of constructor

  start() {
    // 听Task Queue接受新任务
    this.chk_task_interval = setInterval(
      this.chk_new_task,
      this.chk_task_interval_time
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
      this.update_node_stat_interval_time
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
      this.redis.lpop(this.task_queue_name, 0, (err, res) => {
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
        } else {
          // 从任务队列中取出任务
          let task = JSON.parse(res[1]);
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
          // 生成新的bee
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
          update_node_stat();
        }
      });
    }
  } // end of chk_new_task

  update_node_stat() {

    // 更新node_stat中的node信息
    this.node_stat.NODE_ID = this.node_id
    this.node_stat.UPTIME = Math.floor(Date.now() / 1000) - this.start_timestamp
    this.uptime = this.node_stat.UPTIME
    this.node_stat.TASK_LIMIT = this.task_limit
    this.node_stat.TASK_COUNT = this.bees.length
    this.node_stat.REDIS_URL = this.redis_url
    this.node_stat.TASK_QUEUE = this.task_queue_name
    this.node_stat.TASK_CHG_REQ_CHANNEL = this.task_chg_req_channel_name
    this.node_stat.TASK_CHG_RES_CHANNEL = this.task_chg_res_channel_name
    this.node_stat.TASK_STAT_TABLE = this.task_stat_table_name
    this.node_stat.NODE_STAT_TABLE = this.node_stat_table_name

    // 更新node_stat中的task信息
    if (this.bees.length > 0) {
      this.node_stat.TASK_LIST = this.bees.map((bee) => {
        return {
          ID: bee.task.ID,
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
    // 停止bee
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
  } // end of stop
} // end of class Hive

const hive = new Hive();
hive.start();
