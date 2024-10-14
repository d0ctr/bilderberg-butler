const health = {
    last_update: '0'
};

const getHealth = (service) => {
    if (!service) {
        return health;
    }

    return health[service];
};

const setHealth = (service, value) => {
    if (!service) {
        return;
    }

    if (value == null) {
        delete health[service];
    }
    else {
        health[service] = value;
    }
    health.last_update = new Date().toISOString();
}

module.exports = {
    getHealth,
    setHealth
}