const { ethers, nexus } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { setTime } = require('./helpers');
const { setEtherBalance } = require('../../utils/evm');

const { ContractIndexes } = nexus.constants;
const ONE_DAY = BigInt(24 * 60 * 60);
const MIN_VOTING_PERIOD = 3n * ONE_DAY;
const PRODUCT_TYPE_ID = 1n;
const CLAIM_ID = 1;
const IPFS_HASH = ethers.solidityPackedKeccak256(['string'], ['standard-ipfs-hash']);

async function setup() {
  const accounts = await getAccounts();

  // Deploy Registry Mock
  const registry = await ethers.deployContract('RegistryMock', []);
  const assessment = await ethers.deployContract('Assessment', [registry]);
  const claims = await ethers.deployContract('ASMockClaims', [registry]);

  // Add contracts in the registry
  const [governanceAccount] = accounts.governanceContracts;
  await registry.addContract(ContractIndexes.C_ASSESSMENT, assessment.target, false);
  await registry.addContract(ContractIndexes.C_CLAIMS, claims.target, false);
  await registry.addContract(ContractIndexes.C_GOVERNOR, governanceAccount.address, false);

  // Join assessors and members in the registry
  const signature = ethers.toBeHex(0, 32);
  await Promise.all([
    ...accounts.assessors.map(a => registry.join(a.address, signature)),
    ...accounts.members.map(a => registry.join(a.address, signature)),
  ]);

  // Add assessors to a new assessor group
  const newGroupId = 0; // 0 - new group
  const assessorMemberIds = await Promise.all(accounts.assessors.map(a => registry.getMemberId(a.address)));
  await assessment.connect(governanceAccount).addAssessorsToGroup(assessorMemberIds, newGroupId);

  // Set assessment data for product type
  const ASSESSOR_GROUP_ID = await assessment.getGroupsCount();
  await assessment
    .connect(governanceAccount)
    .setAssessmentDataForProductTypes([PRODUCT_TYPE_ID], ONE_DAY, ASSESSOR_GROUP_ID);

  // Use a member account to submit the claim
  const [memberAccount] = accounts.members;
  await setEtherBalance(memberAccount.address, ethers.parseEther('10'));

  // Submit a claim via the member account (this will call startAssessment internally)
  await claims.connect(memberAccount).submitClaim(CLAIM_ID, ethers.parseEther('1'), IPFS_HASH);

  // Give Claims contract ETH balance for tests that need to impersonate it
  await setEtherBalance(claims.target, ethers.parseEther('10'));

  // Reset blockchain time to create predictable timing baseline for all tests
  // This ensures: assessment.start = currentTime - 1 for all tests using this fixture
  const block = await ethers.provider.getBlock('latest');
  if (!block) {
    throw new Error('Block not found');
  }

  await setTime(block.timestamp + 1);

  return {
    accounts,
    contracts: {
      assessment,
      registry,
      claims,
    },
    constants: {
      ASSESSOR_GROUP_ID,
      PRODUCT_TYPE_ID,
      CLAIM_ID,
      MIN_VOTING_PERIOD,
      IPFS_HASH,
    },
  };
}

module.exports = {
  setup,
};
