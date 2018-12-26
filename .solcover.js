module.exports = {
  port: 8555,
  norpc: true,
  deepSkip: true,
  skipFiles: [
    'imports',
    'Pool1.sol',
    'Pool2.sol',
    'EventCaller.sol',
    'Governance.sol',
    'ProposalCategory.sol',
    'mocks'
  ],
  forceParse: [
    'imports/ERC1132',
    'imports/govblocks-protocol',
    'Governance.sol',
    'ProposalCategory.sol',
    'mocks'
  ]
};
