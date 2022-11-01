const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('constructor', function () {
  it('should set nxm and coverNFT addresses correctly', async function () {
    const { nxm, coverNFT } = this.contracts;

    const YieldTokenIncidents = await ethers.getContractFactory('YieldTokenIncidents');
    const yieldTokenIncidents = await YieldTokenIncidents.deploy(nxm.address, coverNFT.address);

    const nxmAddress = await yieldTokenIncidents.nxm();
    const coverNFTAddress = await yieldTokenIncidents.coverNFT();

    expect(nxmAddress).to.be.equal(nxm.address);
    expect(coverNFTAddress).to.be.equal(coverNFT.address);
  });
});
