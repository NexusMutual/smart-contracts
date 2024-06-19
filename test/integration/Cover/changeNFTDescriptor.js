const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('changeNFTDescriptor', function () {
  it('should change NFTDescriptor address in coverNFT', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master, coverNFT } = fixture.contracts;

    const coverNFTDescriptorAddressBefore = await coverNFT.nftDescriptor();

    const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);

    await cover.changeCoverNFTDescriptor(coverNFTDescriptor.address);

    const coverNFTDescriptorAddressAfter = await coverNFT.nftDescriptor();

    expect(coverNFTDescriptorAddressAfter).to.not.be.equal(coverNFTDescriptorAddressBefore);
    expect(coverNFTDescriptorAddressAfter).to.equal(coverNFTDescriptor.address);
  });
});
