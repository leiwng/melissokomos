/***
 * Bee 负责通过 ssh 通道从远程目标机上获取数据，包括日志数据和执行 shell script 的结果数据
 * Hive 实现数据采集的自管理 self-management，包括：
 * 1. 以容器运行，对自身负载进行监控，当负载过高时，自动停止接受新的采集任务
 * 2. 自动读取采集任务,并交由 Bee 执行
 * 3. 非正常终止，重启后会优先恢复现有任务，然后再获取新任务
***/
const logger = require("./bee_logger")
const BumbleBee = require("./bumblebee")
const CuckooBee = require("./cuckoobee")
const MasonBee = require("./masonbee")


class Bee {
    constructor(task) {

        if (task.type == "agent") {
            return new MasonBee(task)
        } else if (task.type == "active") {
            return new CuckooBee(task)
        } else if (task.type == "passive") {
            return new BumbleBee(task)
        } else {
            logger.error(`Unknown task type: ${task.type}`)
            throw new Error("Invalid task type: ")
        }
    } // end of constructor
} // end of class Bee

module.exports = Bee