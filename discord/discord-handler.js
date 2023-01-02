const ChannelSubscriber = require('./channel-subscriber');
const PresenceSubscriber = require('./presence-subscriber');
const { server, user } = require('./command-handlers/info-handlers');
const { subscribe, unsubscribe } = require('./command-handlers/channel-subscriber-handler');
const { presence, unpresence } = require('./command-handlers/presence-subscriber-handler');

class DiscordHandler {
    constructor(client) {
        this.client = client;
        this.app = client.app;
        this.logger = require('../logger').child({module: 'discord-handler'});
    }

    async ping() {
        return {
            type: 'text',
            text: 'Pong!'
        }
    }

    server = server.bind(this);

    user = user.bind(this);

    subscribe = subscribe.bind(this);

    unsubscribe = unsubscribe.bind(this);

    // presence = presence.bind(this);

    // unpresence = unpresence.bind(this);
}

module.exports = DiscordHandler;