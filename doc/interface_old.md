# 接口文档

## old env

```python
# New 下达 Task队列名
SINGED_TASK_QUEUE="SINGED_TASK_QUEUE"
# 现有 Task变更请求通道名
SINGED_TASK_CHG_REQ_CH="SINGED_TASK_CHG_REQ_CH"
# 现有 Task变更返回通道名
SINGED_TASK_RETURN_QUEUE="SINGED_TASK_RETURN_QUEUE"
#  Taskstate update表名
SINGED_TASK_STAT_HSET="SINGED_TASK_STAT_HSET"

# node state update表名
SINGED_NODE_STAT_HSET="SINGED_NODE_STAT_HSET"
# node 配置变更请求通道名
SINGED_NODE_CHG_REQ_CH="SINGED_NODE_CHG_REQ_CH"
# node 配置变更结果返回队列
SINGED_NODE_RETURN_QUEUE="SINGED_NODE_RETURN_QUEUE"
```

## node 环境变量

```text
env.SINGED_NODE_ID
env.SINGED_TASK_LIMIT
env.SINGED_REDIS_URL
env.SINGED_TASK_QUEUE
env.SINGED_TASK_CHG_REQ_CH
env.SINGED_TASK_RETURN_QUEUE
env.SINGED_TASK_STAT_HSET
env.SINGED_NODE_STAT_HSET
```

##  Task（单个）

### 被动采集 Passive

```json
{
  "ID":"63356f488f6d22caed963047",
    "TYPE": "Passive",
  "NAME": "mobile bank app log collection",
  "DESC": "mobile bank app log collection",
  "INPUT": {
    "DESC": "app log file on 77",
    "ID": "234523452345234",
    "SSH_HOST": "192.168.0.77",
    "SSH_PORT": 22,
    "SSH_USER": "voyager",
    "SSH_PASS": "welcome1",
    "COMMAND_LINE": "tail -f /demo/labTab/AIOpsDemo/log_data/dst_mbank.4.log"  "ENCODING": "utf-8"
  },
  "OUTPUT": {
    "DESC": "lines of log",
    "ID": "234523452343433",
    "TYPE": "REDIS",
    "METHOD": "PUB",
    "URL": "redis://192.168.0.77:6379/0",
    "CHANNEL": "MBANK-BIZ-log-192.168.0.77-LINES-001"
  }
}
```

### 解析 Parse

```json
{
  "ID":"63356f488f6d22caed963047",        
  "TYPE": "Parser",        
  "NAME": "mobile bank app log parser",        
  "DESC": "Parse mobile bank app log",        
  "INPUT": {
    "DESC": "lines of app log",
    "ID": "234523452343433",
    "TYPE": "REDIS",
    "METHOD": "SUB",
    "URL": "redis://192.168.0.77:6379/0",
    "CHANNEL": "MBANK-BIZ-log-192.168.0.77-LINES-001"        
  },        
  "OUTPUT": {
    "DESC": "JSON object of log",
    "ID": "234523452349087",
    "TYPE": "REDIS",
    "METHOD": "PUB",
    "URL": "redis://192.168.0.77:6379/0",
    "CHANNEL": "MBANK-BIZ-log-192.168.0.77-JSON-001"        
  }
}
```
