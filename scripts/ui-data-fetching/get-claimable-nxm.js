require('dotenv').config();
const { ethers } = require('hardhat');

const NexusViewerABI = [
  {
    type: 'constructor',
    payable: false,
    inputs: [
      { type: 'address', name: '_master' },
      { type: 'address', name: '_stakingViewer' },
      { type: 'address', name: '_assessmentViewer' },
      { type: 'address', name: '_nxm' },
    ],
  },
  { type: 'error', name: 'RevertedWithoutReason', inputs: [{ type: 'uint256', name: 'index' }] },
  {
    type: 'function',
    name: 'assessmentViewer',
    constant: true,
    stateMutability: 'view',
    payable: false,
    gas: 11000000,
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getClaimableNXM',
    constant: true,
    stateMutability: 'view',
    payable: false,
    gas: 11000000,
    inputs: [
      { type: 'address', name: 'member' },
      { type: 'uint256[]', name: 'tokenIds' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { type: 'uint256', name: 'governanceRewards' },
          { type: 'uint256', name: 'assessmentRewards' },
          { type: 'uint256', name: 'assessmentStake' },
          { type: 'uint256', name: 'stakingPoolTotalRewards' },
          { type: 'uint256', name: 'stakingPoolTotalExpiredStake' },
          { type: 'uint256', name: 'stakingPoolManagerIsNXMLockedForMV' },
          { type: 'uint256', name: 'managerTotalRewards' },
          { type: 'uint256', name: 'legacyPooledStakeRewards' },
          { type: 'uint256', name: 'legacyPooledStakeDeposits' },
          { type: 'uint256', name: 'legacyClaimAssessmentTokens' },
          { type: 'uint256', name: 'legacyCoverNoteDeposits' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getStakedNXM',
    constant: true,
    stateMutability: 'view',
    payable: false,
    gas: 11000000,
    inputs: [
      { type: 'address', name: 'member' },
      { type: 'uint256[]', name: 'tokenIds' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { type: 'uint256', name: 'stakingPoolTotalActiveStake' },
          { type: 'uint256', name: 'assessmentStake' },
          { type: 'uint256', name: 'assessmentStakeLockupExpiry' },
          { type: 'uint256', name: 'assessmentRewards' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'master',
    constant: true,
    stateMutability: 'view',
    payable: false,
    gas: 11000000,
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'multicall',
    constant: false,
    payable: false,
    gas: 11000000,
    inputs: [{ type: 'bytes[]', name: 'data' }],
    outputs: [{ type: 'bytes[]', name: 'results' }],
  },
  {
    type: 'function',
    name: 'nxm',
    constant: true,
    stateMutability: 'view',
    payable: false,
    gas: 11000000,
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'stakingViewer',
    constant: true,
    stateMutability: 'view',
    payable: false,
    gas: 11000000,
    inputs: [],
    outputs: [{ type: 'address' }],
  },
];
const NexusViewerAddress = '0xF62eEc897fa5ef36a957702AA4a45B58fE8Fe312';

const member = '0xd6CE9335f5A68e885271CdbE460b7A4FED5FeDA9';
const tokenIds = [34, 35, 36, 103, 136];

async function main() {
  const viewer = await ethers.getContractAt(NexusViewerABI, NexusViewerAddress);

  const claimableNXM = await viewer.getClaimableNXM(member, tokenIds);

  console.log('Claimable NXM:', claimableNXM);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
