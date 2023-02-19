/***
 * Cuckoobee 喜鹊蜂, 主动采集, 通过 ssh 通道从远程目标机上执行 shell script 获get 花粉。
***/
const logger = require("./hive_logger")(require("path").basename(__filename))
