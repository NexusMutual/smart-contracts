const { expect } = require('chai');
const { ethers } = require('hardhat');

const coverNFTAddress = '0x0000000000000000000000000000000000000001';
const stakingNFTAddress = '0x0000000000000000000000000000000000000002';
const factoryAddress = '0x0000000000000000000000000000000000000003';
const stakingPoolImplementationAddress = '0x0000000000000000000000000000000000000003';

describe('initialize', function () {
  it('should initialize variables correctly', async function () {
    const Cover = await ethers.getContractFactory('Cover');

    // Uninitialized cover
    const cover = await Cover.deploy(
      coverNFTAddress,
      stakingNFTAddress,
      factoryAddress,
      stakingPoolImplementationAddress,
    );

    expect(await cover.coverNFT()).to.equal(coverNFTAddress);
    expect(await cover.stakingNFT()).to.equal(stakingNFTAddress);
    expect(await cover.stakingPoolFactory()).to.equal(factoryAddress);
    expect(await cover.stakingPoolImplementation()).to.equal(stakingPoolImplementationAddress);

    expect(await cover.globalCapacityRatio()).to.be.equal(0);
    expect(await cover.globalRewardsRatio()).to.be.equal(0);
    expect(await cover.coverAssetsFallback()).to.be.equal(0);

    await cover.initialize();

    expect(await cover.globalCapacityRatio()).to.be.equal(20000);
    expect(await cover.globalRewardsRatio()).to.be.equal(5000);
    expect(await cover.coverAssetsFallback()).to.be.equal(3);
  });

  it('should revert if globalCapacityRatio already set to a non-zero value', async function () {
    const { accounts, cover } = this;
    const [governance] = accounts.governanceContracts;
    await cover.connect(governance).updateUintParameters([0], ['10000']);
    await expect(cover.initialize()).to.be.revertedWithCustomError(cover, 'AlreadyInitialized');
  });

  it('should not initialize twice', async function () {
    const Cover = await ethers.getContractFactory('Cover');

    const cover = await Cover.deploy(
      coverNFTAddress,
      stakingNFTAddress,
      factoryAddress,
      stakingPoolImplementationAddress,
    );

    await cover.initialize();
    await expect(cover.initialize()).to.be.revertedWithCustomError(cover, 'AlreadyInitialized');
  });
});
