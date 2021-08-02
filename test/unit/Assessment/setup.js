const {accounts, ethers} = require('hardhat');

async function setup() {

  const NXM = await ethers.getContractFactory('NXMTokenMock');
  nxm = await NXM.deploy('NXM', 'NXM');
  await nxm.deployed();
  const DAI = await ethers.getContractFactory('ERC20BlacklistableMock');
  dai = await DAI.deploy('DAI', 'DAI');
  await dai.deployed();
  const Assessment = await ethers.getContractFactory('Assessment');
  assessment = await Assessment.deploy(NXM.address);
  await assessment.deployed();

  this.contracts = {
    nxm,
    dai,
    assessment,
  };
}

module.exports = {
  setup,
};
