const health = {};

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

    health[service] = value;
}

module.exports = {
    getHealth,
    setHealth
}