const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { setEtherBalance } = require('../utils').evm;

const product0 = {
  productId: 0,
  weight: 100,
  initialPrice: '500',
  targetPrice: '500',
};

const initializeParams = {
  poolId: 1,
  isPrivatePool: false,
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  products: [product0],
  ipfsDescriptionHash: 'Description Hash',
};

describe('initialize', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts if cover contract is not the caller', async function () {
    const { stakingPool, cover } = fixture;
    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    await expect(
      stakingPool.initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash),
    ).to.be.revertedWithCustomError(stakingPool, 'OnlyCoverContract');

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash),
    ).to.not.be.reverted;
  });

  it('reverts if initial pool fee exceeds max pool fee', async function () {
    const { stakingPool, cover } = fixture;

    const { poolId, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(isPrivatePool, maxPoolFee + 1, maxPoolFee, poolId, ipfsDescriptionHash),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolFeeExceedsMax');
  });

  it('reverts if max pool fee is 100%', async function () {
    const { stakingPool, cover } = fixture;
    const { poolId, initialPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool.connect(coverSigner).initialize(isPrivatePool, initialPoolFee, 100, poolId, ipfsDescriptionHash),
    ).to.be.revertedWithCustomError(stakingPool, 'MaxPoolFeeAbove100');
  });

  it('correctly initialize pool parameters', async function () {
    const { stakingPool, cover } = fixture;
    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await stakingPool
      .connect(coverSigner)
      .initialize(isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash);

    expect(await stakingPool.getPoolFee()).to.be.equal(initialPoolFee);
    expect(await stakingPool.getMaxPoolFee()).to.be.equal(maxPoolFee);
    expect(await stakingPool.isPrivatePool()).to.be.equal(isPrivatePool);
  });
});
