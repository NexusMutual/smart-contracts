const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { Role } = require('../../../lib/constants');
const { getAccounts } = require('../../utils/accounts');
const { impersonateAccount, setEtherBalance } = require('../utils').evm;
const { parseEther } = ethers.utils;

async function setup() {
  const accounts = await getAccounts();
  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.deployed();

  const ASMockTokenController = await ethers.getContractFactory('ASMockTokenController');
  const tokenController = await ASMockTokenController.deploy(nxm.address);
  await tokenController.deployed();

  const ASMockIndividualClaims = await ethers.getContractFactory('ASMockIndividualClaims');
  const individualClaims = await ASMockIndividualClaims.deploy();
  await individualClaims.deployed();

  const ASMockRamm = await ethers.getContractFactory('RammMock');
  const ramm = await ASMockRamm.deploy();
  await ramm.deployed();

  await nxm.setOperator(tokenController.address);

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const Assessment = await ethers.getContractFactory('Assessment');
  const assessment = await Assessment.deploy(nxm.address);
  await assessment.deployed();

  const ASMockMemberRoles = await ethers.getContractFactory('ASMockMemberRoles');
  const memberRoles = await ASMockMemberRoles.deploy();
  await memberRoles.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('TC'), tokenController.address),
    master.setTokenAddress(nxm.address),
    master.setLatestAddress(hex('CI'), individualClaims.address),
    master.setLatestAddress(hex('AS'), assessment.address),
    master.setLatestAddress(hex('MR'), memberRoles.address),
    master.setLatestAddress(hex('RA'), ramm.address),
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
    await nxm.mint(member.address, parseEther('10000'));
    await nxm.connect(member).approve(tokenController.address, parseEther('10000'));
  }

  const config = {
    minVotingPeriod: Number(await assessment.getMinVotingPeriod()),
    payoutCooldown: Number(await assessment.getPayoutCooldown()),
    silentEndingPeriod: Number(await assessment.getSilentEndingPeriod()),
    stakeLockupPeriod: Number(await assessment.getStakeLockupPeriod()),
  };

  await impersonateAccount(tokenController.address);
  await setEtherBalance(tokenController.address, parseEther('100'));
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
