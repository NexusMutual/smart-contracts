const { assert } = require('chai');
const {
  ethers: {
    utils: { parseEther },
  },
  ethers,
} = require('hardhat');

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');
const IStakingPool = artifacts.require('IStakingPool');

describe('createStakingPool', function () {
  it.only('should create new pool', async function () {
    const { cover, nxm, memberRoles } = this;

    const {
      advisoryBoardMembers: [ab1],
      governanceContracts: [gv1],
      members: [stakingPoolCreator, stakingPoolManager],
    } = this.accounts;

    const productId = 0;

    const initialPrice = 260;

    const initialPoolFee = '5'; // 5%
    const maxPoolFee = '5'; // 5%

    const capacityFactor = '1';

    const depositAmount = '0';
    const trancheId = '0';

    const productinitializationParams = [{
      productId: 0,
      weight: 100,
      initialPrice: '500',
      targetPrice: '500'
    }];


    const tx = await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productinitializationParams,
      depositAmount,
      trancheId
    );

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
