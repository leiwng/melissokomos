# Singed Design Document

## Interface

### TASK QUEUE

SINGED_TASK_REQ_Q
SINGED_TASK_RSP_Q

### TASK STATE HSET

SINGED_TASK_STATE_HSET
sINGED_NODE_STATE_HSET

### TASK DEFINITION

#### AGENT TASK

##### AGENT TASK REQUEST

```json
{
    "id": "id",
    "name": "name",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "in": {
        "redis_url": "redis://192.168.0.77:6379/0",
        "encoding": "utf-8",
        "parameter": "agent collector parameter string"
    },
    "out": {
        "redis_url": "redis://192.168.0.77:6379/0",
        "redis_pub_ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### AGENT TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result_desc": "success|fail reason|error desc"
}
```

#### ACTIVE TASK

##### ACTIVE TASK REQUEST

```json
{
    "id": "id",
    "name": "name",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "in": {
        "ssh_host": "98.11.56.21",
        "ssh_port": 22,
        "ssh_user": "get-log",
        "ssh_pass": "get-log123456",
        "encoding": "utf-8",
        "shell_cmd": "tail -F /var/log/messages",
        "exec_type": "interval|on_time|one_shot",
        "trigger": "00:00:00"
    },
    "out": {
        "redis_url": "redis://192.168.0.77:6379/0",
        "redis_pub_ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### ACTIVE TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result_desc": "success|fail reason|error desc"
}
```

#### PASSIVE TASK

##### PASSIVE TASK REQUEST

```json
{
    "id": "id",
    "name": "name",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "in": {
        "ssh_host": "98.11.56.21",
        "ssh_port": 22,
        "ssh_user": "get-log",
        "ssh_pass": "get-log123456",
        "encoding": "utf-8",
        "shell_cmd": "tail -F /var/log/messages",
    },
    "out": {
        "redis_url": "redis://192.168.0.77:6379/0",
        "redis_pub_ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### PASSIVE TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result_desc": "success|fail reason|error desc"
}
```

#### PARSER TASK

##### PARSER TASK REQUEST

```json
{
    "id": "id",
    "name": "name",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "in": {
        "redis_url": "redis://192.168.0.77:6379/0",
        "redis_sub-ch": "mbank6-customer-78.99.12.11",
    },
    "out": {
        "redis_url": "redis://192.168.0.77:6379/0",
        "redis_pub_ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### PARSER TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result_desc": "success|fail reason|error desc"
}
```

#### NODE-TASK-LIMIT-CHANGE TASK

##### NODE-TASK-LIMIT-CHANGE TASK REQUEST

```json
{
    "id": "id",
    "name": "name",
    "node_id": "node_id",
    "scope": "node",
    "type": "",
    "action": "chg_task_limit",
    "desc": "task_limit_change",
    "task_limit": 10
}
```

##### NODE-TASK-LIMIT-CHANGE TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result_desc": "success|fail reason|error desc"
}
```


### NODE STATE REPORT

```json
{
    "id": "node_id",
    "type": "hive|cellar",
    "start_ts": 1674986473492,
    "uptime": 473492,
    "task_limit": 10,
    "task_count": 3,
    "redis_url": "redis://192.168.0.77:6379/0",
    "task_req_queue": "task_req_queue",
    "task_rsp_queue": "task_rsp_queue",
    "node_stat_hset": "node_stat_hset",
    "task_list": [
        {
            "task_content": {
                "the copy of task":"the copy of task"
            },
            "task_state": {
                "state": "running|stopped|error",
                "state_desc": "running|stopped|error desc",
                "start_ts": 1674986473492,
                "uptime": 473492,
                "work_count": 47349278
            }
        }
    ]
}
```
