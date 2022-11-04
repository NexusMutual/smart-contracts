const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('initialize', function () {
  it('should initialize variables correctly', async function () {
    const { quotationData, stakingPool, futureCoverNFTAddress, coverAddress, coverUtilsLib } = this;
    const Cover = await ethers.getContractFactory('Cover', {
      libraries: {
        CoverUtilsLib: coverUtilsLib.address,
      },
    });

    // Uninitialized cover
    const cover = await Cover.deploy(
      quotationData.address,
      ethers.constants.AddressZero,
      futureCoverNFTAddress,
      stakingPool.address,
      coverAddress,
    );

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

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], ['10000']);

    await expect(cover.initialize()).to.be.revertedWith('Cover: already initialized');
  });

  it('should not initialize twice', async function () {
    const { quotationData, stakingPool, futureCoverNFTAddress, coverAddress, coverUtilsLib } = this;
    const Cover = await ethers.getContractFactory('Cover', {
      libraries: {
        CoverUtilsLib: coverUtilsLib.address,
      },
    });

    const cover = await Cover.deploy(
      quotationData.address,
      ethers.constants.AddressZero,
      futureCoverNFTAddress,
      stakingPool.address,
      coverAddress,
    );

    await cover.initialize();
    await expect(cover.initialize()).to.be.revertedWith('Cover: already initialized');
  });
});
