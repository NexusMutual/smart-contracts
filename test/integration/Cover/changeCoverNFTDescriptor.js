const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('changeCoverNFTDescriptor', function () {
  it('should change coverNFTDescriptor address', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master, coverNFT } = fixture.contracts;
    const {
      advisoryBoardMembers: [abMember],
    } = fixture.accounts;

    const coverNFTDescriptorAddressBefore = await coverNFT.nftDescriptor();

    const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);

    await cover.connect(abMember).changeCoverNFTDescriptor(coverNFTDescriptor.address);

    const coverNFTDescriptorAddressAfter = await coverNFT.nftDescriptor();

    expect(coverNFTDescriptorAddressAfter).to.not.be.equal(coverNFTDescriptorAddressBefore);
    expect(coverNFTDescriptorAddressAfter).to.equal(coverNFTDescriptor.address);
  });

  it('should fail to change coverNFTDescriptor address if the caller is not ab member', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);

    await expect(cover.connect(member).changeCoverNFTDescriptor(coverNFTDescriptor.address)).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });
});
