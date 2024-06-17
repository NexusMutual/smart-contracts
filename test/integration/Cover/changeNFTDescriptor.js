const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getGovernanceSigner } = require('../utils/enroll');

describe('changeNFTDescriptor', function () {
  it('should change NFTDescriptor address in coverNFT', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master, coverNFT, gv } = fixture.contracts;
    const governanceSigner = await getGovernanceSigner(gv);

    const coverNFTDescriptorAddressBefore = await coverNFT.nftDescriptor();

    const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);

    await cover.connect(governanceSigner).changeNFTDescriptor(coverNFTDescriptor.address);

    const coverNFTDescriptorAddressAfter = await coverNFT.nftDescriptor();

    expect(coverNFTDescriptorAddressAfter).to.not.be.equal(coverNFTDescriptorAddressBefore);
    expect(coverNFTDescriptorAddressAfter).to.equal(coverNFTDescriptor.address);
  });

  it('should fail to change NFTDescriptor address in coverNFT if the caller is not internal', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);

    await expect(cover.connect(member).changeNFTDescriptor(coverNFTDescriptor.address)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });
});
