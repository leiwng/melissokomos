const Hive = require('./hive')
const Cellar = require('./cellar')
const tasks = require('./tasks.json')

const hive = new Hive(tasks)
hive.start()

const cellar = new Cellar(tasks)
cellar.start()