const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { calculateCurrentTrancheId } = require('../../utils/stakingPool');
const { setup } = require('./setup');
const { parseEther } = ethers;

const ONE_DAY_SECONDS = 24 * 60 * 60;
const BUCKET_DURATION = 28 * ONE_DAY_SECONDS;

async function getCurrentBucket() {
  const lastBlock = await ethers.provider.getBlock('latest');
  return Math.floor(lastBlock.timestamp / BUCKET_DURATION);
}

async function processExpirationsForSetup() {
  const fixture = await loadFixture(setup);
  const { stakingNFT } = fixture.contracts;
  const { tokenIds, poolId } = fixture.stakingPool;
  const [manager] = fixture.accounts.members;

  const tokenId = await stakingNFT.mint.staticCall(poolId, manager.address);
  await stakingNFT.mint(poolId, manager.address);
  tokenIds.push(tokenId);

  return fixture;
}

describe('processExpirationsFor', function () {
  it('processExpirationsFor should emit BucketExpired when a bucket expires for the manager', async function () {
    const fixture = await loadFixture(processExpirationsForSetup);
    const { stakingViewer, stakingPool, stakingNFT } = fixture.contracts;
    const { tokenIds } = fixture.stakingPool;

    const firstActiveBucketIdBefore = await stakingPool.getFirstActiveBucketId();
    const initialCurrentBucket = await getCurrentBucket();
    expect(firstActiveBucketIdBefore).to.equal(initialCurrentBucket);

    // adjust time so that the bucket expires
    const increasedBuckets = 7;
    await time.increase(BUCKET_DURATION * increasedBuckets);

    for (const tokenId of tokenIds) {
      const poolId = await stakingNFT.stakingPoolOf(tokenId);
      expect(poolId.toString()).to.equal('1');
    }

    const processExpiration = stakingViewer.processExpirationsFor(tokenIds);
    await expect(processExpiration).to.emit(stakingPool, 'BucketExpired').withArgs(firstActiveBucketIdBefore);
  });

  it('is idempotent when called repeatedly for the same tokenIds', async function () {
    const fixture = await loadFixture(processExpirationsForSetup);
    const { stakingViewer, stakingPool } = fixture.contracts;
    const { tokenIds } = fixture.stakingPool;

    await time.increase(BUCKET_DURATION * 7);

    await stakingViewer.processExpirationsFor(tokenIds);
    const firstActiveBucketAfterFirstCall = await stakingPool.getFirstActiveBucketId();

    await expect(stakingViewer.processExpirationsFor(tokenIds)).to.not.be.reverted;
    const firstActiveBucketAfterSecondCall = await stakingPool.getFirstActiveBucketId();

    expect(firstActiveBucketAfterSecondCall).to.equal(firstActiveBucketAfterFirstCall);
  });

  it('processes expirations for tokenIds across multiple pools', async function () {
    const fixture = await loadFixture(processExpirationsForSetup);
    const [, otherManager] = fixture.accounts.members;
    const { stakingViewer, stakingProducts, tokenController, nxm } = fixture.contracts;
    const params = [false, 5, 5, [], 'ipfs hash'];

    const [secondPoolId, secondPoolAddress] = await stakingProducts
      .connect(otherManager)
      .createStakingPool.staticCall(...params);
    await stakingProducts.connect(otherManager).createStakingPool(...params);
    await tokenController.setStakingPoolManager(secondPoolId, otherManager.address);

    await nxm.mint(otherManager.address, parseEther('100000'));
    await nxm.connect(otherManager).approve(tokenController.target, ethers.MaxUint256);

    const secondPool = await ethers.getContractAt('StakingPool', secondPoolAddress);
    const trancheId = await calculateCurrentTrancheId();
    const secondPoolTokenId = await secondPool
      .connect(otherManager)
      .depositTo.staticCall(parseEther('1000'), trancheId, 0, otherManager.address);
    await secondPool.connect(otherManager).depositTo(parseEther('1000'), trancheId, 0, otherManager.address);

    const allTokenIds = [...fixture.stakingPool.tokenIds, secondPoolTokenId];
    await time.increase(BUCKET_DURATION * 7);

    await expect(stakingViewer.processExpirationsFor(allTokenIds))
      .to.emit(fixture.contracts.stakingPool, 'BucketExpired')
      .and.to.emit(secondPool, 'BucketExpired');
  });
});
