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
      members: [stakingPoolCreator, stakingPoolManager],
    } = this.accounts;
    const initialPoolFee = '5'; // 5%
    const maxPoolFee = '5'; // 5%

    const depositAmount = '0';
    const trancheId = '0';

    const productinitializationParams = [{
      productId: 0,
      weight: 100,
      initialPrice: '500',
      targetPrice: '500'
    }];

    const firstStakingPoolAddress = await cover.stakingPool(0);

    console.log({
      firstStakingPoolAddress
    });

    await cover.connect(stakingPoolCreator).createStakingPool(
      stakingPoolManager.address,
      false, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      productinitializationParams,
      depositAmount,
      trancheId
    );

    const stakingPoolInstance = await ethers.getContractAt('IStakingPool', firstStakingPoolAddress);
    const storedManager = await stakingPoolInstance.manager();
    assert.equal(storedManager, stakingPoolManager.address);

    const proxyInstance = await ethers.getContractAt('MinimalBeaconProxy', firstStakingPoolAddress);

    const beacon = await proxyInstance.beacon();

    await assert.equal(beacon, cover.address);
  });
});
