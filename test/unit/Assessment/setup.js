const { ethers, nexus } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { setEtherBalance } = require('../../utils/evm');

const { ContractIndexes } = nexus.constants;
const ONE_DAY = BigInt(24 * 60 * 60);
const MIN_VOTING_PERIOD = 3n * ONE_DAY;
const PRODUCT_TYPE_ID = 1n;
const CLAIM_ID = 1;
const IPFS_HASH = ethers.solidityPackedKeccak256(['string'], ['standard-ipfs-hash']);

async function setup() {
  const accounts = await getAccounts();

  // Deploy contracts
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

  // Set assessment data for each product type
  // NOTE: mock claims sets product type to coverId, so we need to set for each coverId that is used in tests
  const ASSESSOR_GROUP_ID = await assessment.getGroupsCount();
  await assessment
    .connect(governanceAccount)
    .setAssessmentDataForProductTypes([PRODUCT_TYPE_ID, 2, 3, 4], ONE_DAY, 7n * ONE_DAY, ASSESSOR_GROUP_ID);

  // Use a member account to submit the claim
  const [coverOwner] = accounts.members;
  await setEtherBalance(coverOwner.address, ethers.parseEther('10'));

  // Submit a claim using the cover owner account
  await claims.connect(coverOwner).submitClaim(CLAIM_ID, ethers.parseEther('1'), IPFS_HASH);

  // Give Claims contract ETH balance for tests that need to impersonate it
  await setEtherBalance(claims.target, ethers.parseEther('10'));

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
