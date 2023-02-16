const { expect } = require('chai');
const { ethers } = require('hardhat');
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
  it('reverts if cover contract is not the caller', async function () {
    const { stakingPool, cover } = this;
    const manager = this.accounts.defaultSender;
    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    await expect(
      stakingPool.initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash),
    ).to.be.revertedWithCustomError(stakingPool, 'OnlyCoverContract');

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash),
    ).to.not.be.reverted;
  });

  it('reverts if initial pool fee exceeds max pool fee', async function () {
    const { stakingPool, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, maxPoolFee + 1, maxPoolFee, poolId, ipfsDescriptionHash),
    ).to.be.revertedWithCustomError(stakingPool, 'PoolFeeExceedsMax');
  });

  it('reverts if max pool fee is 100%', async function () {
    const { stakingPool, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, initialPoolFee, 100, poolId, ipfsDescriptionHash),
    ).to.be.revertedWithCustomError(stakingPool, 'MaxPoolFeeAbove100');
  });

  // TODO: StakingProducts test
  it.skip('reverts if product target price is too high', async function () {
    const { stakingPool, stakingProducts, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, products, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const TARGET_PRICE_DENOMINATOR = (await stakingProducts.TARGET_PRICE_DENOMINATOR()).toNumber();

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...products[0], targetPrice: (TARGET_PRICE_DENOMINATOR + 1).toString() }],
          poolId,
          ipfsDescriptionHash,
        ),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetPriceTooHigh');

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...products[0], targetPrice: TARGET_PRICE_DENOMINATOR.toString() }],
          poolId,
          ipfsDescriptionHash,
        ),
    ).to.not.be.reverted;
  });

  // TODO: StakingProducts test
  it.skip('reverts if product weight bigger than 1', async function () {
    const { stakingPool, stakingProducts, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, products, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const WEIGHT_DENOMINATOR = (await stakingProducts.WEIGHT_DENOMINATOR()).toNumber();

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...products[0], weight: WEIGHT_DENOMINATOR + 1 }],
          poolId,
          ipfsDescriptionHash,
        ),
    ).to.be.revertedWithCustomError(stakingProducts, 'TargetWeightTooHigh');

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [{ ...products[0], weight: WEIGHT_DENOMINATOR }],
          poolId,
          ipfsDescriptionHash,
        ),
    ).to.not.be.reverted;
  });

  // TODO: StakingProducts test
  it.skip('reverts if products total target exceeds max total weight', async function () {
    const { stakingPool, stakingProducts, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const MAX_TOTAL_WEIGHT = await stakingProducts.MAX_TOTAL_WEIGHT();
    const validProducts = Array(MAX_TOTAL_WEIGHT.div(product0.weight))
      .fill(product0)
      .map((value, index) => ({ ...value, productId: index }));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [...validProducts, { ...product0, productId: validProducts.length }],
          poolId,
          ipfsDescriptionHash,
        ),
    ).to.be.revertedWithCustomError(stakingProducts, 'TotalTargetWeightExceeded');

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(
          manager.address,
          isPrivatePool,
          initialPoolFee,
          maxPoolFee,
          [...validProducts],
          poolId,
          ipfsDescriptionHash,
        ),
    ).to.not.be.reverted;
  });

  it('correctly initialize pool parameters', async function () {
    const { stakingPool, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash);

    expect(await stakingPool.getPoolFee()).to.be.equal(initialPoolFee);
    expect(await stakingPool.getMaxPoolFee()).to.be.equal(maxPoolFee);
    expect(await stakingPool.isPrivatePool()).to.be.equal(isPrivatePool);
  });

  it('correctly sets the manager', async function () {
    const { stakingPool, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await stakingPool
      .connect(coverSigner)
      .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, poolId, ipfsDescriptionHash);

    const actualManager = await stakingPool.manager();
    expect(actualManager).to.be.equal(manager.address);
  });

  // TODO: StakingProducts test
  it.skip('correctly initializes the list of products', async function () {
    const { stakingPool, stakingProducts, cover } = this;
    const manager = this.accounts.defaultSender;

    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    const validProducts = Array(3)
      .fill(product0)
      .map((value, index) => {
        return {
          ...value,
          productId: index,
          weight: (index + 1) * 10,
          initialPrice: ((index + 1) * 500).toString(),
          targetPrice: ((index + 1) * 500).toString(),
        };
      });

    await stakingPool
      .connect(coverSigner)
      .initialize(
        manager.address,
        isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        [...validProducts],
        poolId,
        ipfsDescriptionHash,
      );

    for (const [index, product] of validProducts.entries()) {
      const [lastEffectiveWeight, targetWeight, targetPrice, bumpedPrice, bumpedPriceUpdateTime] =
        await stakingProducts.products(poolId, index);
      expect(targetWeight).to.be.equal(product.weight);
      expect(targetPrice.toString()).to.be.equal(product.targetPrice);
      expect(bumpedPrice.toString()).to.be.equal(product.initialPrice);
      expect(bumpedPriceUpdateTime).to.not.be.eq(0);
      expect(lastEffectiveWeight).to.be.equal(0);
    }
  });

  // TODO: StakingProducts test
  it.skip('emits PoolDescriptionSet event', async function () {
    const { stakingPool, cover } = this;
    const manager = this.accounts.defaultSender;
    const [nonManager] = this.accounts.nonMembers;

    const { poolId, initialPoolFee, maxPoolFee, isPrivatePool, ipfsDescriptionHash } = initializeParams;

    const coverSigner = await ethers.getImpersonatedSigner(cover.address);
    await setEtherBalance(coverSigner.address, ethers.utils.parseEther('1'));

    await expect(
      stakingPool
        .connect(coverSigner)
        .initialize(manager.address, isPrivatePool, initialPoolFee, maxPoolFee, [], poolId, ipfsDescriptionHash),
    )
      .to.emit(stakingPool, 'PoolDescriptionSet')
      .withArgs(ipfsDescriptionHash);

    await expect(stakingPool.connect(manager).setPoolDescription('newIPFSHash'))
      .to.emit(stakingPool, 'PoolDescriptionSet')
      .withArgs('newIPFSHash');

    await expect(stakingPool.connect(nonManager).setPoolDescription('newIPFSHash')).to.be.revertedWithCustomError(
      stakingPool,
      'OnlyManager',
    );
  });
});
