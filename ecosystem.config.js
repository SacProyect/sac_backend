// ecosystem.config.js
module.exports = {
    apps: [
        {
            name: 'sac-backend',
            script: 'index.ts', // or app.js or src/server.js – your main entry file
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
        },
    ],
};