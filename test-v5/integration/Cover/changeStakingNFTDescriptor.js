const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('changeStakingNFTDescriptor', function () {
  it('should change stakingNFTDescriptor address', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingNFT } = fixture.contracts;
    const {
      advisoryBoardMembers: [abMember],
    } = fixture.accounts;

    const coverNFTDescriptorAddressBefore = await stakingNFT.nftDescriptor();

    const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');

    await cover.connect(abMember).changeStakingNFTDescriptor(stakingNFTDescriptor.address);

    const coverNFTDescriptorAddressAfter = await stakingNFT.nftDescriptor();

    expect(coverNFTDescriptorAddressAfter).to.not.be.equal(coverNFTDescriptorAddressBefore);
    expect(coverNFTDescriptorAddressAfter).to.equal(stakingNFTDescriptor.address);
  });

  it('should fail to change stakingNFTDescriptor address if the caller is not ab member', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');

    await expect(cover.connect(member).changeStakingNFTDescriptor(stakingNFTDescriptor.address)).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });
});
