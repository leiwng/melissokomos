
const path = require("path")
const log_m = path.basename(__filename)
const log_f = path.join(__dirname, log_m + ".log")
const logger = require("./pino_logger_cfg")(log_m, "info", log_f)

logger.emerg("emerg")
logger.alert("alert")
logger.crit("crit")
logger.error("error")
logger.warn("warn")
logger.notice("notice")
logger.info("info")
logger.debug("debug")