const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('constructor', function () {
  it('should set nxm and coverNFT addresses correctly', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT } = fixture.contracts;

    const individualClaims = await ethers.deployContract('IndividualClaims', [coverNFT.address]);
    await individualClaims.deployed();

    const coverNFTAddress = await individualClaims.coverNFT();
    expect(coverNFTAddress).to.be.equal(coverNFT.address);
  });
});
