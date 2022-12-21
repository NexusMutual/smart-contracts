const { expect } = require('chai');
const { ethers } = require('hardhat');

const newPoolFixture = {
  initialPoolFee: 5, // 5%
  maxPoolFee: 5, // 5%
  productInitializationParams: [
    {
      productId: 0,
      weight: 100,
      initialPrice: '500',
      targetPrice: '500',
    },
  ],
  ipfsDescriptionHash: 'Description Hash',
};

// beacon proxy init code hash
const INIT_CODE_HASH = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';

describe('createStakingPool', function () {
  it('should create and initialize a new pool minimal beacon proxy pool', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const poolId = 0;

    const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
    const initCodeHash = Buffer.from(INIT_CODE_HASH, 'hex');
    const expectedAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);

    // calculated address check
    const reportedAddress = await cover.stakingPool(poolId);
    expect(reportedAddress).to.be.equal(expectedAddress);

    const tx = await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    // actual address check
    await expect(tx).to.emit(stakingPoolFactory, 'StakingPoolCreated').withArgs(poolId, expectedAddress);

    const proxyInstance = await ethers.getContractAt('MinimalBeaconProxy', expectedAddress);
    const beacon = await proxyInstance.beacon();
    expect(beacon).to.be.equal(cover.address);

    const stakingPoolInstance = await ethers.getContractAt('CoverMockStakingPool', expectedAddress);

    const storedManager = await stakingPoolInstance.manager();
    expect(storedManager).to.be.equal(stakingPoolManager.address);

    // validate variable is initialized
    const contractPoolId = await stakingPoolInstance.poolId();
    expect(contractPoolId).to.be.equal(poolId);
  });

  it('allows anyone to create a new pool', async function () {
    const { cover } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.generalPurpose;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;
    const poolId = 0;

    const firstStakingPoolAddress = await cover.stakingPool(poolId);

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      '', // ipfsDescriptionHash
    );

    const stakingPoolInstance = await ethers.getContractAt('IStakingPool', firstStakingPoolAddress);
    const storedManager = await stakingPoolInstance.manager();
    expect(storedManager).to.be.equal(stakingPoolManager.address);
  });

  it('emits StakingPoolCreated event', async function () {
    const { cover } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams, ipfsDescriptionHash } = newPoolFixture;

    const stakingPoolImplementation = await cover.stakingPoolImplementation();

    const poolId = 0;
    const firstStakingPoolAddress = await cover.stakingPool(poolId);

    const tx = await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      ipfsDescriptionHash,
    );

    expect(tx)
      .to.emit(cover, 'StakingPoolCreated')
      .withArgs(firstStakingPoolAddress, stakingPoolManager.address, poolId, stakingPoolImplementation);

    expect(tx).to.emit(cover, 'PoolDescriptionSet').withArgs(poolId, ipfsDescriptionHash);
  });

  it('increments staking pool count', async function () {
    const { cover, stakingPoolFactory } = this;
    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const { initialPoolFee, maxPoolFee, productInitializationParams } = newPoolFixture;

    const stakingPoolCountBefore = await stakingPoolFactory.stakingPoolCount();

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productInitializationParams,
      '', // ipfsDescriptionHash
    );

    const stakingPoolCountAfter = await stakingPoolFactory.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));
  });
});
