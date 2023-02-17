const optimizer = { enabled: true, runs: 200 };
const compilerSettings = process.env.ENABLE_OPTIMIZER ? { optimizer } : {};

const compilers = {
  '0.5.7': { settings: compilerSettings, version: '0.5.7' }, // nexus mutual v1
  '0.5.17': { settings: compilerSettings, version: '0.5.17' }, // nexus mutual v1
  '0.8.18': { settings: compilerSettings, version: '0.8.18' }, // nexus mutual v2
};

const contracts = {
  '0.5.7': ['contracts/modules/governance/Governance.sol'],
};

const overrides = {};

for (const version in contracts) {
  for (const contract of contracts[version]) {
    overrides[contract] = { version, settings: compilerSettings };
  }
}

// override version AND optimizer for MinimalBeaconProxy to always get the same bytecode
const proxyConfig = {
  version: '0.8.18',
  settings: { optimizer: { enabled: true, runs: 200 } },
};

overrides['contracts/modules/staking/MinimalBeaconProxy.sol'] = proxyConfig;
overrides['contracts/modules/staking/StakingPoolFactory.sol'] = proxyConfig;

module.exports = {
  compilers: Object.values(compilers),
  overrides,
};
