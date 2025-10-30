const { ethers } = require('hardhat');

const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const nxm = await ethers.deployContract('NXMTokenMock');
  const master = await ethers.deployContract('MasterMock');
  const assessment = await ethers.deployContract('AVMockAssessment', [1]);
  const stakingViewer = await ethers.deployContract('NVMockStakingViewer');

  await master.setLatestAddress(hex('AS'), assessment.address);

  const assessmentViewer = await ethers.deployContract('NVMockAssessmentViewer');
  const nexusViewer = await ethers.deployContract('NexusViewer', [
    master.address,
    stakingViewer.address,
    assessmentViewer.address,
  ]);

  return {
    accounts,
    contracts: {
      nxm,
      assessment,
      assessmentViewer,
      stakingViewer,
      nexusViewer,
    },
  };
}

module.exports = {
  setup,
};
