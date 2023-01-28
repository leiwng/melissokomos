const pinoLogger = require("pino");

const levels = {
  emerg: 80,
  alert: 70,
  crit: 60,
  error: 50,
  warn: 40,
  notice: 30,
  info: 20,
  debug: 10,
};

module.exports = pinoLogger(
  {
    name: "Cellar",
    level: process.env.PINO_LOG_LEVEL || "info",
    customLevels: levels,
    useOnlyCustomLevels: true,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  },
  pinoLogger.destination(`${__dirname}/melissokomos.log`)
);
