<div align="center">
    <p style="text-align:center;">
    <a><img src="https://github.com/d0ctr/bilderberg-butler/raw/main/docs/bilderberg_club_10p.png" width="50%" height="50%" /></a>
    </p>
    <br />
    <p>
    <a href="/LICENSE.md" ><img src="https://img.shields.io/github/license/d0ctr/bilderberg-butler" alt="License" /></a>
    <a><img src="https://img.shields.io/github/package-json/v/d0ctr/bilderberg-butler" /></a>
    <a href="https://libraries.io/github/d0ctr/bilderberg-butler"><img src="https://img.shields.io/librariesio/github/d0ctr/bilderberg-butler" /></a>
    <a href="https://www.codacy.com/gh/d0ctr/bilderberg-butler/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=d0ctr/bilderberg-butler&amp;utm_campaign=Badge_Grade"><img src="https://app.codacy.com/project/badge/Grade/f7a7727e43a14c01be84a2233c62284b"/></a>
    <a href="https://www.npmjs.com/package/discord.js/v/14.0.3"><img src="https://img.shields.io/github/package-json/dependency-version/d0ctr/bilderberg-butler/discord.js" /></a>
    <a href="https://www.npmjs.com/package/grammy/v/1.11.2"><img alt="GitHub package.json dependency version (prod)" src="https://img.shields.io/github/package-json/dependency-version/d0ctr/bilderberg-butler/grammy" /></a>
    <a href="https://www.npmjs.com/package/ioredis/v/4.28.3"><img alt="GitHub package.json dependency version (prod)" src="https://img.shields.io/github/package-json/dependency-version/d0ctr/bilderberg-butler/ioredis" /></a>
    <a><img src="https://heroku-shields.herokuapp.com/bilderberg-butler" /></a>
    <a href="https://vault.dotenv.org/project/vlt_7b9007f3078ad4bddb4f05ddba592d88ca09adf1d1fda7b5e5c1231595dbcb76/example"><img alt="fork with dotenv-vault" src="https://badge.dotenv.org/fork.svg?r=1" /></a>
    </p>
</div>

<h1><a href="https://t.me/BilderbergButler_bot">@Bilderberg Butler</a></h1>

This is an application that runs two bots simultaniously: one for Discord and one for Telegram.

  - [Functionality](#functionality)
    * [Discord Bot](#discord-bot)
      + [Commands](#commands)
    * [Telegram Bot](#telegram-bot)
      + [Commands](#commands-1)
      + [Inline Query](#inline-query)
    * [API](#api)
      + [Endpoints](#endpoints)
  - [Using or altering code](#using-or-altering-code)
    * [Prerequisities](#prerequisities)
      + [Acquiring application runtime essentials](#acquiring-application-runtime-essentials)
      + [Required tools](#required-tools)
    * [Environment Variables](#environment-variables)
    * [Discord Slash Commands Registration](#discord-slash-commands-registration)
    * [Running Bots](#running-bots)
  - [Credits](#credits)


# Functionality

## Discord Bot

This bot talks with you in English and have a number of interesting (and not so much) capabilities.

### Commands

  - /ping — pong
  - /user — prints the name and the id of the user who sent the command
  - /server — print the name and the id of the server where the command was sent
  - /wordle
    - start — starts the scheduler that daily creates new event on the server with link to wordle (new event starts at 21:00:00 UTC)
    - stop — stops the scheduler
    - status — prints the status of the wordle scheduler
    - clearall — deletes all events on the server
    - whitelist — deletes all events and stops the scheduler
  - /subscribe — {voice channel} {telegram chat id} — will send (and edit afterwards) to `telegram chat id` a message containing the list of current users and their statuses in `voice channel` . It will be pinned and updated on any change. When channel becomes empty the message will be deleted. 
  - /unsubscribe {voice channel} {telegram chat id?} — will turn off the feature for selected `voice channel` and won't send messages to `telegram chat id` or (if empty) to all previously configured `telegram chat id`s.

## Telegram Bot

This bot talks with you in Russian (because I've decided so, fill free to add translations).

### Commands

  - /start — start bot in private chat
  - /help — list of commands
  - /ping — pong
  - /calc {math eq} — result of math equation
  - /discord_notification —  returns current chat id for Discord intergration
  - /set {name} — saving content of a message that was replied with this command
  - /get {name} — getting content that was saved by `/set`
  - /get_list — getting a list of possible /get
  - /ahegao — getting a random ahegao
  - /urban {phrase?} — get the random or the phrase (if specified) definition from urban dictionary
  - /html {HTML text} — return submitted text as HTML formatted
  - /cur {amount} {from} {to} — convert amount from one currency to another
  - /gh {link} — convert GitHub link to a GitHub link with Instant View
  - /wiki {query} — returns a summary from wikipedia
  - /deep {prompt} — generates an image based on prompt with DeepAI

### Inline Query

You can get results of some of the commands by typing somewhat like `@<Bot name> /ping` in Telegram app in input field, mentioned example will result in sending `pong`, where `pong` is the result of the `/ping` command.

Here is the list of supported inline commands:

  - /ping
  - /calc
  - /get
  - /get_list
  - /ahegao
  - /urban
  - /html
  - /cur
  - /gh
  - /curl
  - /wiki

## API

Small API for utilities and webhooks.

### Endpoints

  - / — go to project page
  - /health — fetch components health (from "off" to "ready")
    - /:name — fetch health only of one of the components (redis, discord, telegram, api (ironic))
  - /command — telegram-like commands. Arguments are passed as `args=` query parameter converted to URL string.
    - /help — will return HTML page with help message
    - /cur?args=amount,from,to — will return only the resulting amount as JSON
    - /calc?args=math_expression — will return only the result of the equation as JSON
    - /ahegao — returns random ahegao

# Using or altering code

You can use this code to start your own bot/s or you may also contribute something very beautiful (basically anything other than my code).

## Prerequisities

### Acquiring application runtime essentials

  - Create Discord application and bot as a part of it. To learn how to do it you may follow [guide from discord.js](https://discordjs.guide/preparations/setting-up-a-bot-application.html) or an [official Discord guide](https://discord.com/developers/docs/getting-started).
    - You may also not do it, if you only intend to use Telegram bot.
  - Create Telegram bot. You can do it by following [official guide from Telegram](https://core.telegram.org/bots).
    - You may also not do it, if you only intend to use Discord bot.
  - Create a Redis instance. I use Redis Add-on in Heroku (which is basically click-and-ready), search the web if you want to do it the other way.
    - You may create an empty application in Heroku and add Redis to it (but I am not sure if that's the best way).
    - You may ignore that if you like, most of the Telegram side features are available without it. It is necessary only for Telegram commands `/get`, `/set`, `/get_list` and Discord `/wordle`, `/subscribe`, `/unsubscribe`.
      - It is also possible to use above Discord commands without Redis, but only if you are sure that your application won't be restarted at any point (if that happends application will lose data about wordle schedulers and voice channel subscriptions).

### Required tools

  - Internet.
  - Node.JS version 16.0.0 or above.
  - Package manager (I used npm).

## Environment Variables

To authenticate as Discord or/and Telegram application needs tokens and other parameters, you should've acquired them in in guides described in [Prerequisities](#prerequisities).
This application automatically loads variables specified in [`.env`](https://www.youtube.com/watch?v=dQw4w9WgXcQ) file that you should create yourself or you can export environment variables anyway you like.

  - `DISCORD_TOKEN` — Discord bot token (ignore if you are not planning to use it)
  - `APP_ID` — Discord application id (ignore if you are not planning to use Discord bot)
  - `TELEGRAM_TOKEN` — Telegram bot token (ignore if you are not planning to use it)
  - `REDISCLOUD_URL` — Redis connection URL that can be accepted by [ioredis](https://www.npmjs.com/package/ioredis/v/4.28.3) (can also be ignored)
  - `PORT` — Port for API (can be ignored)
  - `ENV` — define environment, if equals `dev` (or if `PORT` is not specified, or if `DOMAIN` is not specified) will start polling for Telegram client, if is absent will start webhooking
  - `COINMARKETCAP_TOKEN` — CoinMarketCap API token for currency conversion
  - `DOMAIN` — domain that application is available on (neeeded for webhooks and API)

## config.json

Config file is used to share some non-secret variables

  - `AHEGAO_API` — API to get urls for random ahegao
  - `API_HOMEPAGE` — URL to which redirect home (`/`) endpoint to
  - `URBAN_API` — API for definitions from urban dictionary
  - `COINMARKETCAP_API` — API for CoinMarketCap
  - `VIDEO_THUMB_URL` — placeholder for video thumbnail in inline query results

## Discord Slash Commands Registration

Before using Discord bot you need to specify slash commands that it can accept, there is additional script for that [`deploy-commands.js`](/deploy-commands.js).
To use it just run this in your command line:

```powershell
npm run deploy
```

## Running Bots

After specifying runtime parameters the way you like you can start bot/s by simple command:

```powershell
npm start
```
# Credits

  - Authored by [@d0ctr](https://d0ctr.github.io/d0ctr)
  - Many thanks to:
    - [@egecelikci](https://github.com/egecelikci) for making a dataset of ahegao
    - The developers and maintainers of [grammY](https://github.com/grammyjs/grammY) framework
    - Developers of [discord.js](https://github.com/discordjs/discord.js) — for making its guide and framework itself
