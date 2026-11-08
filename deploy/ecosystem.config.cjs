// pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'thuvien-dtu',
    script: 'server.js',
    cwd: __dirname + '/..',
    env: { PORT: 3000, HOST: '127.0.0.1', NODE_ENV: 'production' },
    max_memory_restart: '400M',
    kill_timeout: 5000,
  }],
};
