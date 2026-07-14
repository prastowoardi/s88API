import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEVEL_COLORS = {
  error: "\x1b[31m", // merah
  warn: "\x1b[33m",  // kuning
  info: "\x1b[32m",  // hijau
  debug: "\x1b[34m", // biru
};
const RESET = "\x1b[0m";

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      level: "debug",
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ timestamp, level, message }) => {
          const color = LEVEL_COLORS[level] || "";
          return `[${timestamp}] ${color}${level.toUpperCase()}${RESET}: ${message}`;
        })
      )
    }),

    new winston.transports.File({
      filename: path.join(__dirname, "log", `${new Date().toISOString().slice(0, 10)}.log`),
      level: "debug",
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
      )
    }),
  ],
});

export default logger;
