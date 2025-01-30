const optimizer = { enabled: true, runs: 200 };
const compilerSettings = process.env.ENABLE_OPTIMIZER ? { optimizer } : {};

const compilers = [
  { settings: compilerSettings, version: '0.5.17' }, // nexus mutual v1
  { settings: compilerSettings, version: '0.8.28' }, // nexus mutual v2
];

// override version AND optimizer for MinimalBeaconProxy and StakingPoolFactory to always get the same bytecode
const proxyConfig = {
  version: '0.8.18',
  settings: { optimizer: { enabled: true, runs: 200 } },
};

const overrides = {
  'contracts/modules/staking/MinimalBeaconProxy.sol': proxyConfig,
  'contracts/modules/staking/StakingPoolFactory.sol': proxyConfig,
};

module.exports = {
  compilers: Object.values(compilers),
  overrides,
};
