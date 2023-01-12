const dotenv = require('dotenv');
dotenv.config({
    path: './.env.production'
});

const { Bot } = require('grammy');