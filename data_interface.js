/***
# ChangeLog
- 10-24
  - 修改ID字段名为TASKID，防止和其他ID冲突
- 10-23
  - 修改最大任务数消息体
    - 定义接收和返回消息体
    - node 首次Start 可以从环境变量读取到默认最大任务数
    - 接收到命令后，修改最大任务数
- 10-21
  -  Stop 任务消息体
    - 取消worknode字段，node 接到广播只需要判断自身有无任务即可
    - TYPE：Active，Passive，Agent，没有parsertype 。因为一条任务子任务是采集+解析成对出现，所以只需要发一条广播，采集node 需要判断是Active，Passive，Agent哪一种再执行，解析node 接到广播，无需判断type 就可执行

- 10-15
  - 消息体新增ACTION字段，Start 任务Start， Stop 任务Stop
  - 新增 Stop 任务消息体,worknode字段预留，后续提供
***/
/***
1. 任务接口

- 中文需要unicode吗？
- CHANNEL字段
  - 如果用push就是队列名称，如果是PUB/SUB就是频道名称
  - COLLECTOR和PARSER之间，之前定是的走队列
  - PARSER向外是用PUB/SUB
***/

/***
1.1 新建任务

1.1.1 新建angent采集

1.1.1.1 接收任务
***/

// 任务下达队列
process.env.SINGED_TASK_QUEUE = SINGED_TASK_QUEUE

// Agent采集任务
AgentTaskSample = {
  "TASKID": 12,
  "ACTION": "Start",
  "TYPE": "Agent",
  "NAME": "代理采集测试",
  "DESC": "测试备注",

  "INPUT": {
      "ENCODING": "UTF-8",
      "COLLECTOR_PARAM": "mobere/erereadsf"
  },

  "OUTPUT": {
      "TYPE": "REDIS",
      "METHOD": "PUSH",
      "URL": "redis://Welcome1@81.68.126.26:19527/0",
      "CHANNEL": "mobile61_mobile60_dlcjtest"
  }
}

/***
1.1.1.2 执行返回
  - 返回结果 队列名（NODE方发送）：SINGED_TASK_RETURN_QUEUE
***/

// Agent采集任务返回
AgentTaskReturnSample = {
  "TASKID": 11,
  "ACTION": "Started",
  "TYPE": "Collector",
  "RESULT": "Success",
  "DESC": ""
}
// - 说明：后台并不关心是什么采集type ，我只需要区分是采集或者解析

/***
1.1.2 新建Active主动采集任务

1.1.2.1 接收

- 队列名：SINGED_TASK_QUEUE
***/
ActiveTaskSample = {
  "TASKID": 11,
  "ACTION": "Start",
  "TYPE": "Active",
  "NAME": "主动采集任务",
  "DESC": "DESC",

  "INPUT": {
    "SSH_HOST": "192.1213.123.123",
    "SSH_PORT": 12321,
    "SSH_USER": "root",
    "SSH_PASS": "3333333",
    "ENCODING": "ASCII",
    "COMMAND_LINE": "tail -F /system/logs1.log",
    "COLLECTOR_TYPE": "Interval",
    "TRIGGER": "19:01:00"
  },

  "OUTPUT": {
    "TYPE": "REDIS",
    "METHOD": "PUSH",
    "URL": "redis://Welcome1@81.68.126.26:19527/0",
    "CHANNEL": "mobile61_mobile60_zdcj_192.1213.123.123"
  }
}
/***
- 说明
  - COLLECTOR_TYPE：任务type
    - Time：每天按时间执行
    - Interval：间隔时间执行
    - OneShot：一次性
  - TRIGGER：时间，看需要我转成秒数不？
***/

/***
1.1.2.2 执行返回
  - 返回结果 队列名（NODE方发送）：SINGED_TASK_RETURN_QUEUE
***/
ActiveTaskReturnSample = {
  "TASKID": 11,
  "ACTION": "Started",
  "TYPE": "Collector",
  "RESULT": "Success",
  "DESC": "",
}

/***
1.1.3 新建被动采集任务
1.1.3.1 接收
- 队列名：SINGED_TASK_QUEUE
***/
PassiveTaskSample = {
  "TASKID": 13,
  "ACTION": "Start",
  "TYPE": "Passive",
  "NAME": "oracle_log",
  "DESC": "oracle_log-desc",

  "INPUT": {
    "SSH_HOST": "192.1213.123.123",
    "SSH_PORT": 12321,
    "SSH_USER": "root",
    "SSH_PASS": "3333333",
    "ENCODING": "ASCII",
    "COMMAND_LINE": "tail -F /system1/logs123.log",
    "COLLECTOR_TYPE": "LongScript"
  },

  "OUTPUT": {
    "TYPE": "REDIS",
    "METHOD": "PUSH",
    "URL": "redis://Welcome1@81.68.126.26:19527/0",
    "CHANNEL": "mobile61_oracle_oracle_log_192.1213.123.123"
  }

}
/***
- 说明
  - COLLECTOR_TYPE：任务type
    - FileTail
    - LongScript
***/

/***
1.1.3.2 执行返回
- 返回结果 队列名（NODE方发送）：SINGED_TASK_RETURN_QUEUE
***/
PassiveTaskReturnSample = {
"TASKID": 11,
"ACTION": "Started",
"TYPE": "Collector",
"RESULT": "Success",
"DESC": "",
}

/***
1.1.4 新建Parser解析任务
1.1.4.1 接收
  - 队列名：SINGED_TASK_QUEUE
***/
ParserTaskSample = {
  "TASKID": 13,
  "ACTION": "Start",
  "TYPE": "Parser",
  "NAME": "oracle_log",
  "DESC": "oracle_log-desc",
  "PARSER_PLUGIN": "ShouJiYinHang_mbank2.js",
  "PARSER_PARAM": "sdflwerew",

  "INPUT": {
    "TYPE": "REDIS",
    "URL": "redis://Welcome1@81.68.126.26:19527/0",
    "METHOD": "POP",
    "CHANNEL": "mobile61_oracle_oracle_log_192.1213.123.123",
  },

  "OUTPUT": {
    "TYPE": "REDIS",
    "METHOD": "PUBLISH",
    "URL": "redis://Welcome1@81.68.126.26:19527/0",
    "CHANNEL": "mobile61_oracle_oracle_log_192.1213.123.123"
  }

}


/***
1.2.  Stop 任务
1.2.1 任务接收
- 接收命令频道名（NODE方接收）：SINGED_TASK_CHG_REQ_CH
***/
StopTaskSample = {
  "ACTION": "TaskStop",
  "TASKID": 12,
  "TYPE": "Agent",
  "NAME": "代理采集测试",
  "DESC": ""
}
/***
  说明:
    - 一条任务子任务是采集+解析成对出现，所以只需要发一条广播
    - 采集node 需要判断是Active，Passive，Agent哪一种再执行
    - 解析node 接到广播，无需判断type 即可执行
***/
/***
1.2.2 执行返回
  - 返回结果 队列名（NODE方发送）：SINGED_TASK_RETURN_QUEUE
***/
StopTaskReturnSample = {
    "ACTION": "TaskStop",
    "TASKID": 12,
    "RESULT": "Success",
    "TYPE": "Agent",
    "NAME": "代理采集测试",
    "DESC": ""
}

/***
2. node 接口

2.1 node Start 上报
  - 返回结果 队列名（NODE方发送）：SINGED_NODE_RETURN_QUEUE
***/
nodeStartSample = {
    "ACTION": "NodeStarted",
    "NODENAME": "active-node-2",
    "RESULT": "Success",
    "DESC": ""
}

/***
2.2 改变node 最大任务数
2.2.1 接收
  - 接收命令频道名（NODE方接收）：SINGED_NODE_CHG_REQ
***/
nodeChangeTaskSample = {
  "ACTION": "Change_Num_Task",
  "NODENAME": "active-node-2",
  "NUM_TASK": 10,
  "DESC": ""
}

/***
2.2.2 返回
  - 返回结果 队列名（NODE方发送）：SINGED_NODE_RETURN_QUEUE
***/
nodeChangeTaskReturnSample = {
    "ACTION": "Change_Num_Task",
    "NODENAME": "active-node-2",
    "RESULT": "Success",
    "NUM_TASK": 10,
    "DESC": ""
}