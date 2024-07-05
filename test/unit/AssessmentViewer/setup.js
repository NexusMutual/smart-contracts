const { ethers } = require('hardhat');

const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const nxm = await ethers.deployContract('NXMTokenMock');
  const master = await ethers.deployContract('MasterMock');
  const stakeLockupPeriodInDays = 2;
  const assessment = await ethers.deployContract('ASMockAssessment', [1, stakeLockupPeriodInDays, 3, 4]);

  await master.setLatestAddress(hex('AS'), assessment.address);

  const assessmentViewer = await ethers.deployContract('AssessmentViewer', [master.address, nxm.address]);

  return {
    accounts,
    contracts: {
      nxm,
      assessment,
      assessmentViewer,
    },
    config: {
      stakeLockupPeriodInDays,
    },
  };
}

module.exports = {
  setup,
};
