<div align="center">
    <p style="text-align:center;">
    <a><img src="https://github.com/d0ctr/bilderberg-butler/raw/main/docs/bilderberg-butler.jpg"/></a>
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
    <a href="https://vault.dotenv.org/project/vlt_7b9007f3078ad4bddb4f05ddba592d88ca09adf1d1fda7b5e5c1231595dbcb76/example"><img alt="fork with dotenv-vault" src="https://badge.dotenv.org/fork.svg?r=1" /></a>
    </p>
</div>

# [@Bilderberg Butler](https://t.me/BilderbergButler_bot)

This is an application that runs two bots simultaniously: one for Discord and one for Telegram.

## Functionality

### Discord Bot

This bot talks with you in English and have a number of interesting (and not so much) capabilities.

#### Commands

  - `/presence`, `/unpresence` - `{telegram chat id} {telegram user id?}` tie, untie user's Discord presence to the telegram user in chat. This will update telgrams chat's description with the latest status in Discord. To avoid deletion of the whole chat's description, it must end with `--`.
  - `/server` — print the name and the id of the server where the command was sent
  - `/subevents`, `/unsubevents` - `{telegram chat id}` subscribe, unsubscribe to events on Discord server. This will send a message containing info about event that has started on the Discord server.
  - `/subscribe`, `/unsubscribe` — `{voice channel} {telegram chat id}` subscribe, unsubscribe to voice channel status. This will send (and edit afterwards) to `telegram chat id` a message containing the list of current users and their statuses in `voice channel`. It will be pinned and updated on any change. When channel becomes empty the message will be deleted.
  - `/user` — prints the name and the id of the user who sent the command

> [!NOTE]
> To get `telegram chat id`, send `/info` command to bot in Telegram.

### Telegram Bot

This bot talks with you in Russian (because I've decided so, fill free to add translations).

#### Commands

  - `/deep` — `{prompt}` generates an image based on prompt with DeepAI
  - `/fizzbuzz` - `{number_1} {word_1} ... {number_n} {word_n}` fizzbuzz from 1 to 101
  - `/gh` — `{link}` convert GitHub link to a GitHub link with Instant View
  - `/help` — list of commands
  - `/html` — `{HTML text}` return submitted text as HTML formatted
  - `/info` —  returns information about current chat
  - `/roundit` - reply to a video to make it a round video message (video must be square, with sides less than 640px, not longer than 60 seconds)
  - `/start` — start bot in private chat
  - `/set`, `/get`, and `/del` — `{name}` saving, getting and deleting content of a message that was replied with this command
    - `/get_list` - list all available getters
  - `/t` - `{query?}` get wise man's words
  - `/tldr` - `{url?}` get a summary of a topic available with url using YaGPT, can also be used as a reply
  - `/voice` - generate audio message from the text of a replied message using OpenAI TTS

#### Inline Query

You can get results of some of the commands by typing somewhat like `@<Bot name> /ping` in Telegram app in input field, mentioned example will result in sending `pong`, where `pong` is the result of the `/ping` command.

Here is the list of supported inline commands:

  - `/get`
  - `/get_list`
  - `/gh`
  - `/html`
  - `/t`
  - `/tldr`
  - ... and all [common commands](#common-commands)

#### ChatGPT integration

If you reply to the bot's message (e.g. in group chats) or write to it directly (in private chat), it will use ChatGPT integration to answer you.

ChatGPT integration uses OpenAI's `gpt-3.5-turbo` model to get answers.

Bot also has a **context tree**! Bot saves user's messages and own responses, so if you reply to either of it, it will use existing thread of messages as the context, which will affect ChatGPT's response. 
  - Note that it makes a difference to which message you reply with new request (context will be captured from the thread of messages that ends with your newest request). 
  - Context is only saved in bot's internal cache, therefore is wiped out at every restart.

##### Special commands for ChatGPT 

  - `/answer` - `{query?}` either reply to bot's message or send as a standalone command, bot will reply to it and (if applicable) to query
  - `/gpt4`, `/gpt4_32` — same as /answer but using `gpt-4` and `gpt-4-32k` respectively
  - `/new_system_prompt` — `{prompt}` changes prompt in current chat. Default: `you are a chat-assistant\nanswer should not exceed 4000 characters`
  - <u>DISABLED</u>: `/tree` — get a representation of bot's tree of context for this chat
  - `/vision` — same as /answer, but will also process photo messages using `gpt-4-vision-preview`

> [!NOTE]
> When `/answer`, `/gpt4`, `/gpt4_32` or `/vision` is used as a reply to a thread that already exists (contains AI generated answers) the whole context will be transfered to the model associated with the command, meaning that every message down the thread will be processed with the new model till another transfer comes.<br/>
> `/vision` will process only the replied photo during the transfer.

### Common commands

Some commands are both available in Discord and Telegram:

  - `/ahegao` — getting a random ahegao
  - `/calc` - `{math eq}` result of math equation
  - `/cur` — `{amount} {from} {to}` convert amount from one currency to another
  - `/curl` — `{url}` sends the result of GET request to the url
  - `/ping` — pong
  - `/game` — `{query}` get infor about a game from RAWG.io
  - `/genius` — `{query}` get info abot a song from genius.com
  - `/imagine` — `{query}` generate image by query using DALL-E 3
  - `/releases` — `{YYYY-MM}` get game releases for submitted year and month from RAWG.io
  - `/urban` — `{phrase?}` get the random or the phrase (if specified) definition from urban dictionary
  - `/wiki` — `{query}` returns a summary from wikipedia
  - `/0o0` — `{query}` turns query into QuErY

## Using or altering code

You can use this code to start your own bot/s or you may also contribute something very beautiful (basically anything other than my code).
I also keep a [jsdoc](https://d0ctr.github.io/bilderberg-butler/jsdoc) for the code (I update it to the best of my ability).

### Logging

There are 3 logging outputs for the project:
  - Standard output - messages are printed in readable format with configurable level
  - File `combined.log` - (only in dev environment) created at the root of the project, messages are printed as JSON with *silly* loglevel
  - Grafana Loki - messages are sent to Grafana Loki storage, formatted as JSON with configurable additional labels and logging level

### Prerequisities

#### Acquiring application runtime essentials

  - Create Discord application and bot as a part of it. To learn how to do it you may follow [guide from discord.js](https://discordjs.guide/preparations/setting-up-a-bot-application.html) or an [official Discord guide](https://discord.com/developers/docs/getting-started).
    - You may also not do it, if you only intend to use Telegram bot.
  - Create Telegram bot. You can do it by following [official guide from Telegram](https://core.telegram.org/bots).
    - You may also not do it, if you only intend to use Discord bot.
  - Create a Redis instance. I use Redis plugin in Railway (which is basically click-and-ready), search the web if you want to do it the other way.
    - You may ignore that if you like, most of the Telegram side features are available without it. It is necessary only for Telegram commands `/set`, `/t` and Discord `/subscribe`, `/subevents`, `/presence`.
      - It is also possible to use above Discord commands without Redis, but only if you are sure that your application won't be restarted at any point (if that happends application will lose data that binds Telegram and Discord).

#### Required tools

  - Internet.
  - Node.JS version 16.0.0 or above.
  - Package manager (I have used npm).

### Environment Variables

To authenticate as Discord or/and Telegram application needs tokens and other parameters, you should've acquired them in in guides described in [Prerequisities](#prerequisities).
This application automatically loads variables specified in [`.env`](https://www.youtube.com/watch?v=dQw4w9WgXcQ) file that you should create yourself or you can export environment variables anyway you like.

  - `COINMARKETCAP_TOKEN` — CoinMarketCap API token for currency conversion (for [/cur](#common-commands))
  - `DEEP_AI_TOKEN` — Deep AI token (for [/deep](#commands-1))
  - `DEFAULT_LOGLEVEL` - default logging level used for [Standard output and Loki](#logging)
  - `DISCORD_APP_ID`, `DISCORD_TOKEN` — Discord application id and token (ignore if you are not planning to use Discord bot)
  - `DOMAIN` — domain that application is available on (neeeded for webhooks and API)
  - `ENABLE_LOKI` - set to `true` to enable Loki logging
  - `ENV` - set to `dev` to configure project for local run:
    - create loggine file `combined.log`
    - print the body of all incoming API requests with *silly* level
    - use [testing servers](https://core.telegram.org/bots/features#testing-your-bot) for Telegram (requires sepparate token)
    - use long polling for Telegram API
  - `LOKI_HOST`, `LOKI_USER`, `LOKI_PASS`, `LOKI_LOGLEVEL`, `LOKI_LABELS` - host url, user, password, logging level and additional labels (as JSON) for Grafana Loki 
  - `PORT` — Port for API (can be ignored)
  - `TELEGRAM_TOKEN` — Telegram bot token (ignore if you are not planning to use it)
  - `OPENAI_TOKEN` — OpenAI account token (for [ChatGPT integration](#chatgpt-integration), [/voice](#commands-1) and [/imagine](#common-commands))
  - `REDIS_URL` — Redis connection URL that can be accepted by [ioredis](https://www.npmjs.com/package/ioredis/v/4.28.3) (can also be ignored)
  - `RAWG_TOKEN` - RAWG.io API token (for [/game, /release](#common-commands))
  - `GENIUS_TOKEN`- genius.com API token (for [/genius](#common-commands))
  - `YA300_TOKEN` - [Ya300](https://300.ya.ru/) API token (for [/tldr](#commands-1))
  - `WEBAPP_URL` — WebApp url (for [/webapp](#commands-1))

### config.json

Config file is used to share some non-secret variables, mostly API bases and other urls.

### Running Bots

After specifying runtime parameters the way you like you can start bot/s by simple command:

```shell
npm start
```
## Credits

  - Authored by [@d0ctr](https://d0ctr.github.io/d0ctr)
  - Many thanks to:
    - [@egecelikci](https://github.com/egecelikci) for making a dataset of ahegao
    - The developers and maintainers of [grammY](https://github.com/grammyjs/grammY) framework
    - Developers of [discord.js](https://github.com/discordjs/discord.js) — for making its guide and framework itself
