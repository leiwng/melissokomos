const pino = require("pino")

const levels = {
    emerg: 80,
    alert: 70,
    crit: 60,
    error: 50,
    warn: 40,
    notice: 30,
    info: 20,
    debug: 10,
}

const logger = (model_name) => {
    return pino(
        {
            name: model_name,
            level: "info",
            customLevels: levels,
            useOnlyCustomLevels: true,
            formatter: (level, message) => {
                const now = new Date()
                return `[${now.toISOString()}] ${level}: ${message}`
            },
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    translateTime: true
                }
            },
            destination: [
                { dest: process.stdout, sync: true },
                { dest: process.stderr, sync: true },
                { dest: `${__dirname}/hive.log`, sync: true }
            ]
        }
    )
}

module.exports = logger