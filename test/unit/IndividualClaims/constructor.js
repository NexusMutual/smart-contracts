const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { setup } = require('./setup');

describe('constructor', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('should set nxm and coverNFT addresses correctly', async function () {
    const { nxm, coverNFT } = fixture.contracts;

    const IndividualClaims = await ethers.getContractFactory('IndividualClaims');
    const individualClaims = await IndividualClaims.deploy(nxm.address, coverNFT.address);

    const nxmAddress = await individualClaims.nxm();
    const coverNFTAddress = await individualClaims.coverNFT();

    expect(nxmAddress).to.be.equal(nxm.address);
    expect(coverNFTAddress).to.be.equal(coverNFT.address);
  });
});
