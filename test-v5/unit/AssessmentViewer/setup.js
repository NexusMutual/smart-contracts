const { ethers } = require('hardhat');

const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../utils').accounts;

const daysToSeconds = days => days * 24 * 60 * 60;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const stakeLockupPeriod = daysToSeconds(2);
  const assessment = await ethers.deployContract('AVMockAssessment', [stakeLockupPeriod]);

  await master.setLatestAddress(hex('AS'), assessment.address);

  const assessmentViewer = await ethers.deployContract('AssessmentViewer', [master.address]);

  return {
    accounts,
    contracts: { assessment, assessmentViewer },
    config: { stakeLockupPeriod },
  };
}

module.exports = {
  setup,
};
