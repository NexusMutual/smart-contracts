/**
 * @typedef {Object} Create2Config
 * @property {string} expectedAddress - The expected deployment address
 * @property {number} salt - The salt value for CREATE2 deployment
 * @property {Array<string>} [constructorArgs] - Optional constructor arguments
 * @property {Object} [libraries] - Optional library addresses for linking
 */

/**
 * Deployment configurations CREATE2 implementations
 * @type {{
 *   create2Impl: Object.<string, Create2Config>
 * }}
 */
const deploymentsConfig = {
  create2Impl: require('./deployments.json'),
};

module.exports = deploymentsConfig;
