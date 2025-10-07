const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getFundedSigner } = require('../../utils/signer');

describe('changeCoverNFTDescriptor', function () {
  it('should change coverNFTDescriptor address', async function () {
    const fixture = await loadFixture(setup);
    const { cover, governor, master, coverNFT } = fixture.contracts;

    const addressBefore = await coverNFT.nftDescriptor();
    const newDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.target]);

    const governorSigner = await getFundedSigner(governor.target);
    await cover.connect(governorSigner).changeCoverNFTDescriptor(newDescriptor.target);

    const addressAfter = await coverNFT.nftDescriptor();
    expect(addressAfter).to.not.be.equal(addressBefore);
    expect(addressAfter).to.equal(newDescriptor.target);
  });

  it('should fail to change coverNFTDescriptor address if the caller is not ab member', async function () {
    const fixture = await loadFixture(setup);
    const { cover, master, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const newDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.target]);

    const changeCoverNFTDescriptor = cover.connect(member).changeCoverNFTDescriptor(newDescriptor.target);
    await expect(changeCoverNFTDescriptor).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });
});
