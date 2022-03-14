const compilerSettings = process.env.ENABLE_OPTIMIZER
  ? { optimizer: { enabled: true, runs: 200 } }
  : {};

const compilers = {
  '0.5.17': { settings: compilerSettings, version: '0.5.17' }, // nexus mutual v1
  '0.8.9': { settings: compilerSettings, version: '0.8.9' }, // nexus mutual v2
};

const contracts = {
  '0.5.7': [
    'contracts/modules/governance/Governance.sol',
  ],
  '0.5.17': [
    '@uniswap/lib/contracts/libraries/FixedPoint.sol',
    '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol',
    '@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol',
  ],
};

const overrides = {};

for (const version in contracts) {
  for (const contract of contracts[version]) {
    overrides[contract] = { version, settings: compilerSettings };
  }
}

module.exports = {
  compilers: Object.values(compilers),
  overrides,
};
