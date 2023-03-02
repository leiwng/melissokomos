

const L2R_TASK_TYPE = {
  "Agent": "agent",
  "Active": "active",
  "Passive": "passive",
  "Parser": "parser",
}

const L2R_TASK_ACTION = {
  "Start": "start",
  "TaskStop": "stop",
  "Change_Num_Task": "chg_task_limit"
}

const L2R_EXEC_TYPE = {
  "Time": "on_time",
  "Interval": "interval",
  "OneShot": "one_shot"
}

const R2L_RSP_TASK_ACTION = {
  "start": "Started",
  "stop": "Stopped",
  "chg_task_limit": "Change_Num_Task",
  "node_started": "NodeStarted",
  "node_stopped": "NodeStopped",
}

const R2L_RSP_TASK_TYPE = {
  "agent": "Collector",
  "active": "Collector",
  "passive": "Collector",
  "parser": "Parser"
}

const R2L_RSP_TASK_RESULT = {
  "success": "Success",
}

module.exports = {
  L2R_TASK_TYPE: L2R_TASK_TYPE,
  L2R_TASK_ACTION: L2R_TASK_ACTION,
  L2R_EXEC_TYPE: L2R_EXEC_TYPE,
  R2L_RSP_TASK_ACTION: R2L_RSP_TASK_ACTION,
  R2L_RSP_TASK_TYPE: R2L_RSP_TASK_TYPE,
  R2L_RSP_TASK_RESULT: R2L_RSP_TASK_RESULT,
}