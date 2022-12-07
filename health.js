/**
 * @typedef {Number} STATE_VALUE
 * @description The state of a component
 * OFF and DEGRADER define bad health
 * ON and READY define good health
 * @property {Number} DEGRADED - The component is degraded
 * @property {Number} OFF - The component is off (not initialized)
 * @property {Number} ON - The component is on (initialized)
 * @property {Number} READY - The component is ready (may not have active connection but is configured)
*/
const STATE = Object.freeze({
    DEGRADED: -1,
    OFF: 0,
    READY: 1,
    ON: 2,
});

/**
 * @typedef {Object} COMPONENT
 * @description The components of the application
 * @property {String} DROPBOX - The dropbox component
 * @property {String} REDIS - The redis component
 * @property {String} TELEGRAM - The telegram component
 * @property {String} DISCORD - The discord component
 * @property {String} API - The api component
 * @property {String} NOTION - The notion component
 */
const COMPONENT = Object.freeze({
    DROPBOX: 'dropbox',
    REDIS: 'redis',
    TELEGRAM: 'telegram',
    DISCORD: 'discord',
    API: 'api',
    NOTION: 'notion'
});

const STATE_NAME = Object.freeze({
    DEGRADED: 'DEGRADED',
    OFF: 'OFF',
    ON: 'ON',
    READY: 'READY'
});

/**
 * @typedef {Object} COMPONENTS_HEALTH
 * @description The health of a component
 * @property {COMPONENT} name - The name of the component
 * @property {STATE_VALUE} status - The status of the component
 */
const components_health = {};

/**
 * Updates the health of a component
 * @param {COMPONENT} component_name - The name of the component to update
 * @param {STATE_VALUE} status - The new status of the component
 */
function updateComponentHealth(component_name, status) {
    if (Object.values(STATE).includes(status)) {
        components_health[component_name] = status;
    }
}

/**
 * Returns the health of a component
 * @param {COMPONENTS} component_name - The name of the component to get the health of
 * @returns {STATE_VALUE} - The health of the component
 */
function getComponentHealth(component_name) {
    return components_health[component_name];
}

/**
 * Returns the health of all components
 * @returns {COMPONENTS_HEALTH} - The health of all components
 */
function getAllComponentsHealth() {
    return components_health;
}

module.exports = {
    updateComponentHealth,
    getComponentHealth,
    getAllComponentsHealth,
    STATE,
    COMPONENT,
};