const { hex } = require('../../../lib/helpers');
const { ethers } = require('hardhat');
const {
  utils: { defaultAbiCoder },
} = ethers;

module.exports = {
  proposalTitle: 'Title',
  proposalSD: 'SD',
  proposalDescHash: 'Description',
  categoryId: 3,
  solutionHash: 'Solution',
  action: defaultAbiCoder.encode(
    [
      'string',
      'uint256',
      'uint256',
      'uint256',
      'uint256[]',
      'uint256',
      'string',
      'address',
      'bytes2',
      'uint256[]',
      'string',
    ],
    ['Test Proposal', 2, 60, 15, [2], 300, '', '0x' + '0'.repeat(40), hex('GV'), [0, 0, 60, 0], 'proposalFunction()'],
  ),
};
