module.exports = {
  port: 8555,
  norpc: true,
  skipFiles: [
    'imports',
    'MCR.sol',
    'MCRData.sol',
    'Pool1.sol',
    'Pool2.sol',
    'Pool3.sol',
    'PoolData.sol',
    'DAI.sol',
    'mocks'
  ],
  deepSkip: true
};
