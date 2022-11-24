const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set nxm address correctly', async function () {
    const { nxm } = this.contracts;

    const Assessment = await ethers.getContractFactory('Assessment');
    const assessment = await Assessment.deploy(nxm.address);
    const nxmAddress = await assessment.nxm();

    expect(nxmAddress).to.be.equal(nxm.address);
  });
});
