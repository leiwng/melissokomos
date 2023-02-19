/***
 * Bee 负责通过 ssh 通道从远程目标机上获get 数据, 包括日志数据和执行 shell script 的结果数据
 * Hive 实现数据采集的自管理 self-management, 包括：
 * 1. 以容器运行, 对自身负载进行监控, 当负载过高时, 自动 Stop 接受New 的采集 Task
 * 2. 自动读get 采集 Task,并交由 Bee 执行
 * 3. NOT 正常终止, 重启后会优先恢复现有 Task, 然后再获get New  Task
***/
const logger = require("./hive_logger")(require("path").basename(__filename))
const BumbleBee = require("./bumblebee")
const CuckooBee = require("./cuckoobee")
const MasonBee = require("./masonbee")


class Bee {
    constructor(task, node_id, node_type) {

        if (task.type == "agent") {
            return new MasonBee(task, node_id, node_type)
        } else if (task.type == "active") {
            return new CuckooBee(task, node_id, node_type)
        } else if (task.type == "passive") {
            return new BumbleBee(task, node_id, node_type)
        } else {
            logger.error(`Unknown task type: ${task.type}`)
            throw new Error("Invalid task type: ")
        }
    } // end of constructor
} // end of class Bee

module.exports = Bee