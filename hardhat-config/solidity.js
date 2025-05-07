const optimizer = { enabled: true, runs: 200 };
const compilerSettings = process.env.ENABLE_OPTIMIZER ? { optimizer } : {};

const compilers = [
  { settings: { ...compilerSettings }, version: '0.5.17' }, // v1
  { settings: { ...compilerSettings, evmVersion: 'prague' }, version: '0.8.28' }, // v2
];

// override version AND optimizer to always get the same bytecode
const customConfig = {
  version: '0.8.18',
  settings: { optimizer: { enabled: true, runs: 200 } },
};

const overrides = {
  'contracts/modules/staking/MinimalBeaconProxy.sol': customConfig,
  'contracts/modules/staking/StakingPoolFactory.sol': customConfig,
};

module.exports = {
  compilers,
  overrides,
};
