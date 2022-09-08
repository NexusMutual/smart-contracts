const { assert } = require('chai');
const { ethers } = require('hardhat');

describe('createStakingPool', function () {
  it('should create new pool', async function () {
    const { cover } = this;

    const [stakingPoolCreator, stakingPoolManager] = this.accounts.members;
    const initialPoolFee = '5'; // 5%
    const maxPoolFee = '5'; // 5%

    const depositAmount = '0';
    const trancheId = '0';

    const productinitializationParams = [
      {
        productId: 0,
        weight: 100,
        initialPrice: '500',
        targetPrice: '500',
      },
    ];

    const firstStakingPoolAddress = await cover.stakingPool(0);

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productinitializationParams,
      depositAmount,
      trancheId,
    );

    const stakingPoolInstance = await ethers.getContractAt('IStakingPool', firstStakingPoolAddress);
    const storedManager = await stakingPoolInstance.manager();
    assert.equal(storedManager, stakingPoolManager.address);

    const proxyInstance = await ethers.getContractAt('MinimalBeaconProxy', firstStakingPoolAddress);

    const beacon = await proxyInstance.beacon();

    await assert.equal(beacon, cover.address);
  });
});
