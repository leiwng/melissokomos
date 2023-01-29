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
    "task_id": "task_id",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "input": {
        "redis-url": "redis://192.168.0.77:6379/0",
        "encoding": "utf-8",
        "parameter": "agent collector parameter string"
    },
    "output": {
        "redis-url": "redis://192.168.0.77:6379/0",
        "redis-pub-ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### AGENT TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result-desc": "success|fail reason|error desc"
}
```

#### ACTIVE TASK

##### ACTIVE TASK REQUEST

```json
{
    "task_id": "task_id",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "input": {
        "ssh-host": "98.11.56.21",
        "ssh-port": 22,
        "ssh-user": "get-log",
        "ssh-pass": "get-log123456",
        "encoding": "utf-8",
        "shell-cmd": "tail -F /var/log/messages",
        "exec-type": "interval|on-time|one-shot",
        "trigger": "00:00:00"
    },
    "output": {
        "redis-url": "redis://192.168.0.77:6379/0",
        "redis-pub-ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### ACTIVE TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result-desc": "success|fail reason|error desc"
}
```

#### PASSIVE TASK

##### PASSIVE TASK REQUEST

```json
{
    "task_id": "task_id",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "input": {
        "ssh-host": "98.11.56.21",
        "ssh-port": 22,
        "ssh-user": "get-log",
        "ssh-pass": "get-log123456",
        "encoding": "utf-8",
        "shell-cmd": "tail -F /var/log/messages",
    },
    "output": {
        "redis-url": "redis://192.168.0.77:6379/0",
        "redis-pub-ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### PASSIVE TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result-desc": "success|fail reason|error desc"
}
```

#### PARSER TASK

##### PARSER TASK REQUEST

```json
{
    "task_id": "task_id",
    "node_id": "node_id",
    "scope": "task|node",
    "type": "agent|active|passive|parser",
    "action": "start|stop|chg_task_limit",
    "desc": "task_desc",
    "input": {
        "redis-url": "redis://192.168.0.77:6379/0",
        "redis-sub-ch": "mbank6-customer-78.99.12.11",
    },
    "output": {
        "redis-url": "redis://192.168.0.77:6379/0",
        "redis-pub-ch": "mbank6-customer-78.99.12.11",
    }
}
```

##### PARSER TASK RESPONSE

```json
{
    "the copy of the task content": "",
    "result": "success|fail",
    "result-desc": "success|fail reason|error desc"
}
```

### NODE STATE REPORT

```json
{
    "id": "node-id",
    "type": "hive|cellar",
    "start-ts": 1674986473492,
    "uptime": 473492,
    "task-limit": 10,
    "task-count": 3,
    "inner-redis-url": "redis://192.168.0.77:6379/0",
    "task-req-queue": "task-req-queue",
    "task-rsp-queue": "task-rsp-queue",
    "task-stat-hset": "task-stat-hset",
    "node-stat-hset": "node-stat-hset",
    "task-list": [
        {
            "task-content": {
                "the copy of task":"the copy of task"
            },
            "task-state": {
                "state": "running|stopped|error",
                "state-desc": "running|stopped|error desc",
                "duration": 473492,
                "work-cnt": 47349278
            }
        }
    ]
}
```

### TASK STATE REPORT

```json
{
    "id": "node-id",
    "type": "hive|cellar",
    "start-ts": 1674986473492,
    "uptime": 473492,
    "task-limit": 10,
    "task-count": 3,
    "inner-redis-url": "redis://192.168.0.77:6379/0",
    "task-req-queue": "task-req-queue",
    "task-rsp-queue": "task-rsp-queue",
    "task-stat-hset": "task-stat-hset",
    "node-stat-hset": "node-stat-hset",
    "task-list": [
        {
            "task-content": {
                "the copy of task":"the copy of task"
            },
            "task-state": {
                "state": "running|stopped|error",
                "state-desc": "running|stopped|error desc",
                "duration": 473492,
                "work-cnt": 47349278
            }
        }
    ]
}
```