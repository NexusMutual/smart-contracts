const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('changeStakingNFTDescriptor', function () {
  it('should change stakingNFTDescriptor address', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingNFT } = fixture.contracts;
    const [abMember] = fixture.accounts.advisoryBoardMembers;

    const addressBefore = await stakingNFT.nftDescriptor();
    const newDescriptor = await ethers.deployContract('StakingNFTDescriptor');

    await cover.connect(abMember).changeStakingNFTDescriptor(newDescriptor.target);

    const addressAfter = await stakingNFT.nftDescriptor();
    expect(addressAfter).to.not.be.equal(addressBefore);
    expect(addressAfter).to.equal(newDescriptor.target);
  });

  it('should fail to change stakingNFTDescriptor address if the caller is not ab member', async function () {
    const fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const newDescriptor = await ethers.deployContract('StakingNFTDescriptor');

    const changeStakingNFTDescriptor = cover.connect(member).changeStakingNFTDescriptor(newDescriptor.target);
    await expect(changeStakingNFTDescriptor).to.be.revertedWith('Caller is not an advisory board member');
  });
});
