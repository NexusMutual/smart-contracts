const { assert } = require('chai');
const {
  ethers: {
    utils: { parseEther },
  },
} = require('hardhat');

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');
const IStakingPool = artifacts.require('IStakingPool');

describe('createStakingPool', function () {
  it('should create new pool', async function () {
    const { cover } = this;

    const {
      advisoryBoardMembers: [ab1],
      governanceContracts: [gv1],
      members: [stakingPoolCreator, stakingPoolManager],
    } = this.accounts;

    const productId = 0;

    const initialPrice = 260;
    const targetPrice = 260;
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const stakingPool = await CoverMockStakingPool.new();
    const capacityFactor = '1';

    await cover.connect(gv1).setGlobalCapacityRatio(capacityFactor);
    await cover.connect(ab1).setInitialPrice(productId, initialPrice);

    await stakingPool.setStake(productId, capacity);
    await stakingPool.setTargetPrice(productId, targetPrice);
    await stakingPool.setUsedCapacity(productId, activeCover);

    const tx = await cover.connect(stakingPoolCreator).createStakingPool(stakingPoolManager.address);

    const receipt = await tx.wait();

    const { stakingPoolAddress, manager, stakingPoolImplementation } = receipt.events[0].args;

    const expectedStakingPoolImplementation = await cover.stakingPoolImplementation();

    assert.equal(manager, stakingPoolManager.address);
    assert.equal(stakingPoolImplementation, expectedStakingPoolImplementation);

    const stakingPoolInstance = await IStakingPool.at(stakingPoolAddress);
    const storedManager = await stakingPoolInstance.manager();
    assert.equal(storedManager, stakingPoolManager.address);
  });
});
