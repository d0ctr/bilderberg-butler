const { readdir, readFile } = require('node:fs/promises');
const { join } = require('node:path');

const { Bot, InputFile } = require('grammy');

const TELEGRAM_TOKEN = "";
const MY_CHAT_ID = "";

const bot = new Bot(TELEGRAM_TOKEN, {
    client: {
        // buildUrl: (r, t, m) => `${r}/bot${t}/test/${m}`
    }
});

async function wait(ts) {
    return new Promise(resolve => {
        setTimeout(resolve, ts);
    });
}

const list = [];

bot.init()
    .then(() =>  {
        console.log('innited bot');
        return readdir('./tinkov')
            .then(async files => {
                console.log('read ./tinkov');
                for (const file_name of files) {
                    const file_path = join('./tinkov', file_name);
                    const file = await readFile(file_path).then(file => new InputFile(file, file_name));
                    console.log(`read '${file_path}'`);

                    const file_data = {
                        file_name,
                        file_id: null,
                        file_unique_id: null
                    };
                    const request = async () => {
                        return bot.api.sendVideo(MY_CHAT_ID, file).then(msg => {
                            console.log(`sent '${file_name}'`);
                            list.push({
                                file_name,
                                file_id: msg?.video?.file_id,
                                file_unique_id: msg?.video?.file_unique_id
                            });
                        })
                        .catch(err => {
                            console.error(`failed to send '${file_data.file_name}': ${err}`);
                            if (err?.parameters?.retry_after) return wait(err?.parameters?.retry_after * 1000).then(request);
                        })
                    }

                    await wait(5000).then(request);
                }
        });
    }).catch(err => console.error(`failed to login: ${JSON.stringify(err)}`));

process.addListener('beforeExit', () => {
    console.log(`\n\n\n\n`);
    console.log(JSON.stringify(list, null, 2));
})
