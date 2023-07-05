const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('constructor', function () {
  it('should set nxm address correctly', async function () {
    const fixture = await loadFixture(setup);
    const { nxm } = fixture.contracts;

    const Assessment = await ethers.getContractFactory('Assessment');
    const assessment = await Assessment.deploy(nxm.address);
    const nxmAddress = await assessment.nxm();

    expect(nxmAddress).to.be.equal(nxm.address);
  });
});
