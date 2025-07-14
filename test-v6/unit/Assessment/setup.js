const { ethers } = require('hardhat');
const { getAccounts } = require('../../../test/utils/accounts');
const { setTime } = require('./helpers');
const { setEtherBalance } = require('../../utils/evm');

const { solidityPackedKeccak256 } = ethers;

const ONE_DAY = BigInt(24 * 60 * 60);
const MIN_VOTING_PERIOD = 3n * ONE_DAY;
const PRODUCT_TYPE_ID = 1n;
const CLAIM_ID = 1;
const IPFS_HASH = solidityPackedKeccak256(['string'], ['standard-ipfs-hash']);

// Contract index constants from RegistryAware.sol
const C_CLAIMS = 65536;
const C_GOVERNOR = 2;
const C_ASSESSMENT = 32768;

async function setup() {
  const accounts = await getAccounts();

  // Deploy Registry Mock
  const Registry = await ethers.getContractFactory('RegistryMock');
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  // Deploy Assessment contract
  const Assessment = await ethers.getContractFactory('Assessment');
  const assessment = await Assessment.deploy(await registry.getAddress());
  await assessment.waitForDeployment();

  // Deploy Mock Claims contract
  const ASMockClaims = await ethers.getContractFactory('ASMockClaims');
  const claims = await ASMockClaims.deploy(await registry.getAddress());
  await claims.waitForDeployment();

  // Register contracts in the registry
  const [governanceAccount] = accounts.governanceContracts;
  await Promise.all([
    registry.addContract(C_ASSESSMENT, await assessment.getAddress(), false),
    registry.addContract(C_CLAIMS, await claims.getAddress(), false),
    registry.addContract(C_GOVERNOR, governanceAccount.address, false),
  ]);

  // Add assessors to a new assessor group (0 - new group) using governance account
  const assessorMemberIds = await Promise.all(accounts.assessors.map(a => registry.getMemberId(a.address)));
  await assessment.connect(governanceAccount).addAssessorsToGroup(assessorMemberIds, 0);

  // Get and set ASSESSOR_GROUP_ID for PRODUCT_TYPE_ID using governance account
  const ASSESSOR_GROUP_ID = await assessment.getGroupsCount();
  await assessment
    .connect(governanceAccount)
    .setAssessmentDataForProductTypes([PRODUCT_TYPE_ID], ONE_DAY, ASSESSOR_GROUP_ID);

  // Use a member account to submit the claim
  const [memberAccount] = accounts.members;
  await setEtherBalance(memberAccount.address, ethers.parseEther('10'));

  // Give Claims contract ETH balance for tests that need to impersonate it
  const claimsAddress = await claims.getAddress();
  await setEtherBalance(claimsAddress, ethers.parseEther('10'));

  // Submit a claim via the member account (this will call startAssessment internally)
  await claims.connect(memberAccount).submitClaim(CLAIM_ID, ethers.parseEther('1'), IPFS_HASH);

  // Reset blockchain time to create predictable timing baseline for all tests
  // This ensures: assessment.start = currentTime - 1 for all tests using this fixture
  const block = await ethers.provider.getBlock('latest');
  if (!block) throw new Error('Block not found');
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
