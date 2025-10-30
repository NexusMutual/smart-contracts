/**
 * @typedef {Object} Create1Config
 * @property {string} deployer - The deployer address
 * @property {string} expectedAddress - The expected deployment address
 */

/**
 * @typedef {Object} Create2Config
 * @property {string} expectedAddress - The expected deployment address
 * @property {number} salt - The salt value for CREATE2 deployment
 * @property {Array<string>} [constructorArgs] - Optional constructor arguments
 * @property {Object} [libraries] - Optional library addresses for linking
 */

/**
 * Deployment configurations for CREATE1 proxies, CREATE2 proxies, and CREATE2 implementations
 * @type {{
 *   create1Proxies: Object.<string, Create1Config>,
 *   create2Proxies: Object.<string, Create2Config>,
 *   create2Impl: Object.<string, Create2Config>
 * }}
 */
const deploymentsConfig = {
  create1Proxies: {
    Registry: {
      deployer: '0x68bAd3bDd72d7397D68a22C5e98911E7E45EE395',
      expectedAddress: '0xcafea2c575550512582090AA06d0a069E7236b9e',
    },
  },
  create2Proxies: {
    Governor: {
      expectedAddress: '0xcafea6063d4Ec6b045d9676e58897C1f0882Ca32',
      salt: 1890277623171,
    },
    Pool: {
      expectedAddress: '0xcafea91714e55756C125B509274eDE9Bc91697CB',
      salt: 38025100935,
    },
    SwapOperator: {
      expectedAddress: '0xcafea501b78175F178b899625F06BC618ef06EB8',
      salt: 38495587836,
    },
    Assessments: {
      expectedAddress: '0xcafea55aE10FB1bf21F7aF7a285488C42B59a24A',
      salt: 3781429284683,
    },
    Claims: {
      expectedAddress: '0xcafeac11196a5CC352938aEEd545b32d5b9646fa',
      salt: 3782112694854,
    },
  },
  create2Impl: require('./deployments.json'),
};

module.exports = deploymentsConfig;
