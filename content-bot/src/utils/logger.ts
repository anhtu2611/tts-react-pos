export function createLogger(module: string) {
  const prefix = () => {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    return `[${now}] [${module}]`;
  };

  return {
    info: (...args: unknown[]) => console.log(prefix(), ...args),
    warn: (...args: unknown[]) => console.warn(prefix(), '⚠', ...args),
    error: (...args: unknown[]) => console.error(prefix(), '✖', ...args),
    debug: (...args: unknown[]) => {
      if (process.env.DEBUG) console.log(prefix(), '[DEBUG]', ...args);
    },
  };
}
