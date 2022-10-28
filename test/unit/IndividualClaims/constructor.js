const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set nxm and coverNFT addresses correctly', async function () {
    const { nxm, coverNFT } = this.contracts;

    const IndividualClaims = await ethers.getContractFactory('IndividualClaims');
    const individualClaims = await IndividualClaims.deploy(nxm.address, coverNFT.address);

    const nxmAddress = await individualClaims.nxm();
    const coverNFTAddress = await individualClaims.coverNFT();

    expect(nxmAddress).to.be.equal(nxm.address);
    expect(coverNFTAddress).to.be.equal(coverNFT.address);
  });
});
