const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getFundedSigner } = require('../utils');

describe('changeStakingNFTDescriptor', function () {
  it('should change stakingNFTDescriptor address via Governor', async function () {
    const fixture = await loadFixture(setup);
    const { cover, stakingNFT, governor } = fixture.contracts;

    const addressBefore = await stakingNFT.nftDescriptor();
    const newDescriptor = await ethers.deployContract('StakingNFTDescriptor');

    const governorSigner = await getFundedSigner(governor.target);
    await cover.connect(governorSigner).changeStakingNFTDescriptor(newDescriptor.target);

    const addressAfter = await stakingNFT.nftDescriptor();
    expect(addressAfter).to.not.be.equal(addressBefore);
    expect(addressAfter).to.equal(newDescriptor.target);
  });

  it('should fail to change stakingNFTDescriptor address if the caller is not Governor', async function () {
    const fixture = await loadFixture(setup);
    const { cover, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const newDescriptor = await ethers.deployContract('StakingNFTDescriptor');

    const changeStakingNFTDescriptor = cover.connect(member).changeStakingNFTDescriptor(newDescriptor.target);
    await expect(changeStakingNFTDescriptor).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });
});
