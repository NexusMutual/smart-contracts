const { ethers } = require('hardhat');

async function setup () {
  const AssessmentLibTest = await ethers.getContractFactory('AssessmentLibTest');
  const assessmentLibTest = await AssessmentLibTest.deploy();
  await assessmentLibTest.deployed();

  this.accounts = accounts;
  this.contracts = { assessmentLibTest };
}

module.exports = {
  setup,
};
