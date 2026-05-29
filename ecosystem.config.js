/**
 * PM2 Ecosystem Config
 * Manages both frontend and backend as persistent processes.
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart all
 *   pm2 logs
 *   pm2 status
 */
module.exports = {
  apps: [
    {
      name:         'sb-backend',
      cwd:          './backend',
      script:       'dist/index.js',
      interpreter:  'node',
      instances:    1,
      autorestart:  true,
      watch:        false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV:  'production',
        PORT:      3001,
      },
      error_file:  './logs/backend-error.log',
      out_file:    './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name:         'sb-frontend',
      cwd:          './frontend',
      script:       'node_modules/.bin/next',
      args:         'start -p 3000',
      instances:    1,
      autorestart:  true,
      watch:        false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT:     3000,
      },
      error_file:  './logs/frontend-error.log',
      out_file:    './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
