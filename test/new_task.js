const Redis = require("ioredis");
require('dotenv').config()

task = {
  TASKID: 13,
  ACTION: "Start",
  TYPE: "Passive",
  NAME: "mbank50-APP-Log",
  DESC: "mobile bank 5.0 Application Log",

  INPUT: {
    SSH_HOST: "192.168.0.77",
    SSH_PORT: 22,
    SSH_USER: "voyager",
    SSH_PASS: "welcome1",
    ENCODING: "utf8",
    COMMAND_LINE: "tail -F /demo/labTab/AIOpsDemo/log_data/dst_mbank.4.log",
    COLLECTOR_TYPE: "LongScript"
  },

  OUTPUT: {
    TYPE: "REDIS",
    METHOD: "PUSH",
    URL: "redis://192.168.0.77:6379/0",
    CHANNEL: "mbank50-APP-Log-192.168.0.77"
  }
}

redis = new Redis(process.env.SINGED_REDIS_URL);
redis.lpush(process.env.SINGED_TASK_QUEUE, JSON.stringify(task));
// redis.disconnect();
