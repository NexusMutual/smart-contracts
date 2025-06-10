const { ethers } = require('hardhat');
const { hex, toBytes2 } = require('../../../lib/helpers');
const { Role } = require('../../../lib/constants');
const { getAccounts } = require('../../utils/accounts');
const { impersonateAccount, setEtherBalance } = require('../utils').evm;

async function setup() {
  const accounts = await getAccounts();
  const NXMToken = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXMToken.deploy();

  const ASMockTokenController = await ethers.getContractFactory('ASMockTokenController');
  const tokenController = await ASMockTokenController.deploy(nxm.address);

  const ASMockIndividualClaims = await ethers.getContractFactory('ASMockIndividualClaims');
  const individualClaims = await ASMockIndividualClaims.deploy();

  const ASMockRamm = await ethers.getContractFactory('RammMock');
  const ramm = await ASMockRamm.deploy();

  await nxm.setOperator(tokenController.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();

  const Assessment = await ethers.getContractFactory('Assessment');
  const assessment = await Assessment.deploy(nxm.address);

  const ASMockMemberRoles = await ethers.getContractFactory('ASMockMemberRoles');
  const memberRoles = await ASMockMemberRoles.deploy(nxm.address);

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(toBytes2('TC'), tokenController.address),
    master.setTokenAddress(nxm.address),
    master.setLatestAddress(toBytes2('CI'), individualClaims.address),
    master.setLatestAddress(toBytes2('AS'), assessment.address),
    master.setLatestAddress(toBytes2('MR'), memberRoles.address),
    master.setLatestAddress(toBytes2('RA'), ramm.address),
    master.enrollInternal(individualClaims.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  await assessment.changeMasterAddress(master.address);
  await individualClaims.changeMasterAddress(master.address);

  await assessment.changeDependentContractAddress();
  await individualClaims.changeDependentContractAddress();

  await master.enrollGovernance(accounts.governanceContracts[0].address);
  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.enrollMember(member.address, Role.Member);
    await nxm.mint(member.address, ethers.parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, ethers.parseEther('10000'));
  }

  const config = {
    minVotingPeriod: Number(await assessment.getMinVotingPeriod()),
    payoutCooldown: Number(await assessment.getPayoutCooldown()),
    silentEndingPeriod: Number(await assessment.getSilentEndingPeriod()),
    stakeLockupPeriod: Number(await assessment.getStakeLockupPeriod()),
  };

  await impersonateAccount(tokenController.address);
  await setEtherBalance(tokenController.address, ethers.parseEther('100'));
  accounts.tokenControllerSigner = await ethers.getSigner(tokenController.address);

  return {
    config,
    accounts,
    contracts: {
      nxm,
      dai,
      assessment,
      master,
      individualClaims,
      tokenController,
      memberRoles,
      ramm,
    },
  };
}

module.exports = {
  setup,
};
