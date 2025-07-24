const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { setTime } = require('./helpers');
const { setEtherBalance } = require('../../utils/evm');

const ONE_DAY = BigInt(24 * 60 * 60);
const MIN_VOTING_PERIOD = 3n * ONE_DAY;
const PRODUCT_TYPE_ID = 1n;
const CLAIM_ID = 1;
const IPFS_HASH = ethers.solidityPackedKeccak256(['string'], ['standard-ipfs-hash']);

// Contract index constants from RegistryAware.sol
const C_CLAIMS = 65536;
const C_GOVERNOR = 2;
const C_ASSESSMENT = 32768;

async function setup() {
  const accounts = await getAccounts();

  // Get contract factories
  const [Registry, Assessment, ASMockClaims] = await Promise.all([
    ethers.getContractFactory('RegistryMock'),
    ethers.getContractFactory('Assessment'),
    ethers.getContractFactory('ASMockClaims'),
  ]);

  // Deploy Registry Mock
  const registry = await Registry.deploy();
  const registryAddress = await registry.getAddress();

  // Deploy Assessment and mock Claims contract
  const [assessment, claims] = await Promise.all([
    Assessment.deploy(registryAddress),
    ASMockClaims.deploy(registryAddress),
  ]);

  // Wait for deployments to complete
  await Promise.all([registry.waitForDeployment(), assessment.waitForDeployment(), claims.waitForDeployment()]);

  // Add contracts in the registry
  const [governanceAccount] = accounts.governanceContracts;
  await Promise.all([
    registry.addContract(C_ASSESSMENT, await assessment.getAddress(), false),
    registry.addContract(C_CLAIMS, await claims.getAddress(), false),
    registry.addContract(C_GOVERNOR, governanceAccount.address, false),
  ]);

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
  const claimsAddress = await claims.getAddress();
  await setEtherBalance(claimsAddress, ethers.parseEther('10'));

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
