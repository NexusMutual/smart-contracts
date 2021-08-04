const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;

async function setup () {
  const NXM = await ethers.getContractFactory('NXMTokenMock');
  const nxm = await NXM.deploy();
  await nxm.deployed();

  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  const dai = await DAI.deploy();
  await dai.deployed();

  const Assessment = await ethers.getContractFactory('Assessment');
  const assessment = await Assessment.deploy(nxm.address);
  await assessment.deployed();
  {
    const tx = await assessment.changeMasterAddress(master.address);
    await tx.wait();
  }

  const accounts = await ethers.getSigners();
  // Use address 0 as governance
  await master.enrollGovernance(accounts[0].address);
  for (const account of accounts) {
    await master.enrollMember(account.address, 1);
    await nxm.mint(account.address, ethers.utils.parseEther('100'));
    await nxm.connect(account).approve(assessment.address, ethers.utils.parseEther('100'));
  }

  const COVER_AMOUNT = parseEther('1');
  const FLAT_ETH_FEE_PERC = await assessment.FLAT_ETH_FEE_PERC();
  const submissionFee = parseEther('1')
    .mul(FLAT_ETH_FEE_PERC)
    .div('10000');
  await assessment.submitClaimForAssessment(0, COVER_AMOUNT, false, '', { value: submissionFee });

  this.accounts = accounts;
  this.contracts = {
    nxm,
    dai,
    assessment,
    master,
  };
}

module.exports = {
  setup,
};
