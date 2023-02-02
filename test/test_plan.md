# TEST PLAN

## PASSIVE COLLECTOR TEST PLAN

### PASSIVE COLLECTOR TEST STEPS

#### TEST PASSIVE COLLECTION TASK CAN BE EXECUTED SUCCESSFULLY

1. check log file is in logging
1. The initial node task limit is set to 3
1. Start Hive
1. Put 10 passive collection tasks in queue
1. check task response queue
1. check output redis pub channel from 0 ~ 2

#### TEST CHANGE TASK LIMIT TASK CAN BE EXECUTED SUCCESSFULLY

1. The initial node task limit is set to 3
1. Base on before test, put task limit change (5) task in queue
1. check task response queue
1. check output redis pub channel from 3 ~ 4
