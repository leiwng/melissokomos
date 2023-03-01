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
        { dest: `${__dirname}/broker.log`, sync: true }
      ]
    }
  )
}

// throw new Error('prettyPrint option is no longer supported,
// see the pino - pretty package(https://github.com/pinojs/pino-pretty)')
// const logger = (model_name) => {
//   return pino(
//     {
//       name: model_name,
//       level: "info",
//       customLevels: levels,
//       useOnlyCustomLevels: true,
//       prettyPrint: {
//         ignore: "pid,hostname,time",
//         translateTime: "SYS:standard",
//         messageFormat: "{msg} {filename} {method}",
//       },
//       hooks: {
//         logMethod(inputArgs, method) {
//           const { filename, line, column } = method.getFileInfo()
//           return {
//             ...inputArgs[0],
//             filename,
//             method: method.name,
//             line,
//             column,
//           }
//         },
//       },
//       formatter: (level, message, obj) => {
//         const now = new Date()
//         const formattedObj = {
//           ...obj,
//           msg: message,
//         }
//         return `${now.toISOString()} ${level}: ${JSON.stringify(
//           formattedObj
//         )}`
//       },
//       destination: [
//         { dest: process.stdout, sync: true },
//         { dest: process.stderr, sync: true },
//         { dest: `${__dirname}/hive.log`, sync: true },
//       ],
//     }
//   )
// }


module.exports = logger