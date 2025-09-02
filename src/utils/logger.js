export class Logger {
  constructor(namespace = "app") {
    this.namespace = namespace;
  }
  child(meta = {}) {
    const child = new Logger(this.namespace);
    child.meta = { ...(this.meta || {}), ...meta };
    return child;
  }
  format(level, msg, extra) {
    const time = new Date().toISOString();
    const meta = { ...(this.meta || {}), ...(extra || {}) };
    const base = { time, level, ns: this.namespace, ...meta };
    return JSON.stringify({ ...base, msg });
  }
  debug(msg, extra) { if (process.env.NODE_ENV !== "production") console.debug(this.format("debug", msg, extra)); }
  info(msg, extra) { console.log(this.format("info", msg, extra)); }
  warn(msg, extra) { console.warn(this.format("warn", msg, extra)); }
  error(msg, extra) { console.error(this.format("error", msg, extra)); }
}

export const logger = new Logger("bakchoddost");
