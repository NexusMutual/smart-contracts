const { ethers, nexus } = require('hardhat');
const { loadFixture, time, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const setup = require('../setup');

const { calculatePremium, calculateFirstTrancheId } = nexus.protocol;
const { PoolAsset } = nexus.constants;
const { parseEther, ZeroAddress, MaxUint256 } = ethers;

const TRANCHE_DURATION_SECONDS = 91 * 24 * 60 * 60;

const buyCoverFixture = {
  coverId: 0n,
  owner: ZeroAddress,
  productId: 0,
  coverAsset: PoolAsset.ETH,
  amount: parseEther('1'),
  period: 30n * 24n * 60n * 60n,
  maxPremiumInAsset: MaxUint256,
  paymentAsset: PoolAsset.ETH,
  commissionRatio: 0n,
  commissionDestination: ZeroAddress,
  ipfsData: 'ipfs data',
};

async function generateStakeRewards(fixture) {
  const { stakingProducts, pool, cover } = fixture.contracts;

  const [coverBuyer, coverReceiver] = fixture.accounts.members;
  const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
  const { productId, period, amount } = buyCoverFixture;

  const currentTimestamp = await time.latest();
  const nextBlockTimestamp = currentTimestamp + 10;
  const nxmPrice = await pool.getInternalTokenPriceInAsset(buyCoverFixture.paymentAsset);
  const product = await stakingProducts.getProduct(1, productId);
  const coverAmountAllocationsPerPool = [
    amount / 3n, // a third
    amount / 3n, // second third
    amount - (amount / 3n) * 2n, // whatever's left
  ];

  const premiumInNxmPerPool = coverAmountAllocationsPerPool.map(amount => {
    const { premiumInNxm } = calculatePremium(
      amount,
      nxmPrice,
      period,
      product.bumpedPrice,
      NXM_PER_ALLOCATION_UNIT,
      PoolAsset.ETH,
    );
    return premiumInNxm;
  });

  const premiumInNxm = premiumInNxmPerPool.reduce((total, premiumInNxm) => total + premiumInNxm, 0n);
  const premiumInAsset = (premiumInNxm * nxmPrice) / parseEther('1');

  await time.increaseTo(nextBlockTimestamp);
  await cover.connect(coverBuyer).buyCover(
    { ...buyCoverFixture, owner: coverReceiver.address, maxPremiumInAsset: premiumInAsset },
    [
      { poolId: 1, coverAmountInAsset: coverAmountAllocationsPerPool[0] },
      { poolId: 2, coverAmountInAsset: coverAmountAllocationsPerPool[1] },
      { poolId: 3, coverAmountInAsset: coverAmountAllocationsPerPool[2] },
    ],
    { value: premiumInAsset },
  );
}

describe('withdrawNXM', function () {
  it('should handle empty arrays correctly', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;

    // Get a manager account
    const [manager] = fixture.accounts.stakingPoolManagers;

    const stakingPoolDeposits = [];
    const stakingPoolManagerRewards = [];

    await expect(tokenController.connect(manager).withdrawNXM(stakingPoolDeposits, stakingPoolManagerRewards)).to.not.be
      .reverted;
  });

  it('should revert when called by non-staking pool manager', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [nonManager] = fixture.accounts.members;

    const stakingPoolDeposits = [{ tokenId: 999, trancheIds: [1] }];
    const stakingPoolManagerRewards = [];

    await expect(
      tokenController.connect(nonManager).withdrawNXM(stakingPoolDeposits, stakingPoolManagerRewards),
    ).to.be.revertedWithCustomError(fixture.contracts.stakingNFT, 'NotMinted');
  });

  it('should handle both staking pool deposits and manager rewards', async function () {
    const fixture = await loadFixture(setup);
    const { stakingPool1, token, tokenController, stakingViewer } = fixture.contracts;
    const [manager] = fixture.accounts.stakingPoolManagers;

    const operatorAddress = await token.operator();
    await impersonateAccount(operatorAddress);
    const operator = await ethers.provider.getSigner(operatorAddress);

    // set ETH and NXM balances
    await setBalance(manager.address, parseEther('10000'));
    await setBalance(operatorAddress, parseEther('10000'));
    await token.connect(operator).mint(manager.address, parseEther('10000000'));
    await token.connect(manager).approve(tokenController, MaxUint256);

    // stake
    const latestTimestamp = await time.latest();
    const firstActiveTrancheId = calculateFirstTrancheId(latestTimestamp, buyCoverFixture.period, 0n);
    const depositParams = [fixture.stakeAmount, firstActiveTrancheId + 5, 0, manager.address];
    const tokenId = await stakingPool1.connect(manager).depositTo.staticCall(...depositParams);
    await stakingPool1.connect(manager).depositTo(...depositParams);

    // rewards
    await generateStakeRewards(fixture);
    await time.increase(TRANCHE_DURATION_SECONDS * 7);
    await stakingPool1.processExpirations(true);

    const balanceBefore = await token.balanceOf(manager.address);
    const [tokenBefore] = await stakingViewer.getTokens([tokenId]);
    expect(tokenBefore.expiredStake).to.equal(fixture.stakeAmount);

    // withdraw
    const stakingPoolDeposits = [{ tokenId, trancheIds: [fixture.trancheId] }];
    await tokenController.connect(manager).withdrawNXM(stakingPoolDeposits, []);

    const [tokenAfter] = await stakingViewer.getTokens([tokenId]);
    const balanceAfter = await token.balanceOf(manager.address);

    expect(balanceAfter).to.equal(balanceBefore + tokenBefore.expiredStake + tokenBefore.rewards);
    expect(tokenAfter.expiredStake.toString()).to.equal('0');
  });
});
