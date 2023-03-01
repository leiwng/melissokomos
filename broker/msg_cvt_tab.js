

const TASK_TYPE_L2R = {
  "Agent": "agent",
  "Active": "active",
  "Passive": "passive",
  "Parser": "parser",
}

const TASK_ACTION_L2R = {
  "Start": "start",
  "TaskStop": "stop",
  "Change_Num_Task": "chg_task_limit"
}

const EXEC_TYPE_L2R = {
  "Time": "on_time",
  "Interval": "interval",
  "OneShot": "one_shot"
}

const RSP_TASK_ACTION_R2L = {
  "start": "Started",
}

const RSP_TASK_TYPE_R2L = {
  "agent": "Collector",
  "active": "Collector",
  "passive": "Collector",
  "parser": "Parser"
}

const RSP_TASK_RESULT_R2L = {
  "success": "Success",
}

module.exports = {
  TASK_TYPE_L2R: TASK_TYPE_L2R,
  TASK_ACTION_L2R: TASK_ACTION_L2R,
  EXEC_TYPE_L2R: EXEC_TYPE_L2R,
  RSP_TASK_ACTION_R2L: RSP_TASK_ACTION_R2L,
  RSP_TASK_TYPE_R2L: RSP_TASK_TYPE_R2L,
  RSP_TASK_RESULT_R2L: RSP_TASK_RESULT_R2L,
}