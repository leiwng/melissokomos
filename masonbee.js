/***
 * Masonbee 负责从第三方数据通道获取数据，现在主要支持filebeat输出的数据
 * Cukoobee 实现数据采集的自管理 self-management，包括：
 * 1. 以容器运行，对自身负载进行监控，当负载过高时，自动停止接受新的采集任务
 * 2. 自动读取采集任务,并交由 Bumblebee 执行
 * 3. 非正常终止，重启后会优先恢复现有任务，然后再获取新任务
***/