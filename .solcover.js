module.exports = {
  port: 8555,
  norpc: true,
  deepSkip: true,
  skipFiles: [
    'imports',
    'Pool1.sol',
    'Pool2.sol',
    'Pool3.sol',
    'PoolData.sol',
    'mocks'
  ],
  forceParse: [
    'imports/ERC1132',
    'imports/govblocks-protocol/Governed.sol',
    'mocks'
  ]
};
