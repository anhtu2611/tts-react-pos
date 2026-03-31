module.exports = {
  apps: [
    {
      name: 'content-bot',
      script: 'start.cjs',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
    },
  ],
};
