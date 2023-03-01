/***
  Broker convert task request and response message from and to outside.
***/

const Redis = require("ioredis")
const logger = require("./hive_logger")(require("path").basename(__filename))
