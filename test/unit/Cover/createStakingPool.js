const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('createStakingPool', function () {
  const newPoolFixture = {
    initialPoolFee: 5, // 5%
    maxPoolFee: 5, // 5%
    depositAmount: 0,
    trancheId: 0,
    poolId: 0,
    productInitializationParams: [
      {
        productId: 0,
        weight: 100,
        initialPrice: '500',
        targetPrice: '500',
      },
    ],
  };

  it('should create and initialize a new pool minimal beacon proxy pool', async function () {
    const { cover } = this;

    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;

    const { initialPoolFee, maxPoolFee, productInitializationParams, depositAmount, trancheId, poolId } =
      newPoolFixture;

    const firstStakingPoolAddress = await cover.stakingPool(poolId);

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      depositAmount,
      trancheId,
    );

    const stakingPoolInstance = await ethers.getContractAt('CoverMockStakingPool', firstStakingPoolAddress);
    const proxyInstance = await ethers.getContractAt('MinimalBeaconProxy', firstStakingPoolAddress);

    const storedManager = await stakingPoolInstance.manager();
    expect(storedManager).to.be.equal(stakingPoolManager.address);

    const beacon = await proxyInstance.beacon();
    expect(beacon).to.be.equal(cover.address);

    // validate variable is initialized
    const contractPoolId = await stakingPoolInstance.poolId();
    expect(contractPoolId).to.be.equal(poolId);
  });

  it('allows anyone to create a new pool', async function () {
    const { cover } = this;

    const [stakingPoolCreator, stakingPoolManager] = this.accounts.generalPurpose;

    const { initialPoolFee, maxPoolFee, productInitializationParams, depositAmount, trancheId, poolId } =
      newPoolFixture;

    const firstStakingPoolAddress = await cover.stakingPool(poolId);

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      depositAmount,
      trancheId,
    );

    const stakingPoolInstance = await ethers.getContractAt('IStakingPool', firstStakingPoolAddress);
    const storedManager = await stakingPoolInstance.manager();
    expect(storedManager).to.be.equal(stakingPoolManager.address);
  });

  it('emits StakingPoolCreated event', async function () {
    const { cover } = this;

    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;

    const { initialPoolFee, maxPoolFee, productInitializationParams, depositAmount, trancheId, poolId } =
      newPoolFixture;

    const stakingPoolImplementation = await cover.stakingPoolImplementation();

    const firstStakingPoolAddress = await cover.stakingPool(poolId);

    await expect(
      cover.connect(stakingPoolCreator).createStakingPool(
        stakingPoolManager.address,
        false, // isPrivatePool,
        initialPoolFee,
        maxPoolFee,
        productInitializationParams,
        depositAmount,
        trancheId,
      ),
    )
      .to.emit(cover, 'StakingPoolCreated')
      .withArgs(firstStakingPoolAddress, poolId, stakingPoolManager.address, stakingPoolImplementation);
  });

  it('increments staking pool count', async function () {
    const { cover } = this;

    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;

    const { initialPoolFee, maxPoolFee, productInitializationParams, depositAmount, trancheId } = newPoolFixture;

    const stakingPoolCountBefore = await cover.stakingPoolCount();

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      depositAmount,
      trancheId,
    );

    const stakingPoolCountAfter = await cover.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));
  });
});
