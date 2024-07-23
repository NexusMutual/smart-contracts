const { ethers } = require('hardhat');

const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const stakeLockupPeriodInDays = 2;
  const assessment = await ethers.deployContract('AVMockAssessment', [1, stakeLockupPeriodInDays, 3, 4]);

  await master.setLatestAddress(hex('AS'), assessment.address);

  const assessmentViewer = await ethers.deployContract('AssessmentViewer', [master.address]);

  return {
    accounts,
    contracts: {
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
