const { ethers } = require('hardhat');

const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const nxm = await ethers.deployContract('NXMTokenMock');
  const master = await ethers.deployContract('MasterMock');
  const assessment = await ethers.deployContract('ASMockAssessment', [1, 2, 3, 4]);
  console.log('assessment address: ', assessment.address);
  const stakingViewer = await ethers.deployContract('SPMockStakingViewer');
  console.log('stakingViewer address: ', stakingViewer.address);

  await master.setLatestAddress(hex('AS'), assessment.address);

  const assessmentViewer = await ethers.deployContract('ASMockAssessmentViewer');
  console.log('assessmentViewer address: ', assessmentViewer.address);
  const nexusViewer = await ethers.deployContract('NexusViewer', [
    master.address,
    stakingViewer.address,
    assessmentViewer.address,
  ]);
  console.log('nexusViewer address: ', nexusViewer.address);

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
