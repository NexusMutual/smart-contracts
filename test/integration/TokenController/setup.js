const { loadFixture, setBalance, time, impersonateAccount } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers, nexus } = require('hardhat');

const setup = require('../setup');
const { calculatePremium, calculateFirstTrancheId } = nexus.protocol;

const { parseEther, ZeroAddress, MaxUint256 } = ethers;

const stakedProductParamTemplate = {
  productId: 0,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};
const buyCoverFixture = {
  coverId: 0n,
  owner: ZeroAddress,
  productId: stakedProductParamTemplate.productId,
  coverAsset: 0b0,
  amount: parseEther('1'),
  period: 30n * 24n * 60n * 60n,
  maxPremiumInAsset: MaxUint256,
  paymentAsset: 0b0,
  commissionRatio: 0n,
  commissionDestination: ZeroAddress,
  ipfsData: 'ipfs data',
};

async function stakingPoolSetup(fixture) {
  const { stakingPool1, stakingPool2, stakingPool3, stakingProducts, tokenController, token } = fixture.contracts;
  const [manager1, manager2, manager3] = fixture.accounts.stakingPoolManagers;

  const operatorAddress = await token.operator();
  await impersonateAccount(operatorAddress);
  const operator = await ethers.provider.getSigner(operatorAddress);

  await setBalance(manager1.address, parseEther('10000'));
  await setBalance(operatorAddress, parseEther('10000'));

  // mint and set allowance
  await token.connect(operator).mint(manager1.address, parseEther('10000000'));
  await token.connect(operator).mint(manager2.address, parseEther('10000000'));
  await token.connect(manager1).approve(tokenController, MaxUint256);

  // set products
  await stakingProducts.connect(manager1).setProducts(1, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager2).setProducts(2, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager3).setProducts(3, [stakedProductParamTemplate]);

  // stake
  const stakeAmount = parseEther('900000');
  const latestBlock = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = calculateFirstTrancheId(latestBlock, buyCoverFixture.period, 0n);

  const trancheId = firstActiveTrancheId + 5;
  const depositParams = [stakeAmount, trancheId, 0, manager1.address];
  const tokenId1 = await stakingPool1.connect(manager1).depositTo.staticCall(...depositParams);
  const tokenId2 = await stakingPool2.connect(manager1).depositTo.staticCall(...depositParams);
  const tokenId3 = await stakingPool3.connect(manager1).depositTo.staticCall(...depositParams);

  await stakingPool1.connect(manager1).depositTo(...depositParams);
  await stakingPool2.connect(manager1).depositTo(...depositParams);
  await stakingPool3.connect(manager1).depositTo(...depositParams);

  fixture.tokenIds = [tokenId1, tokenId2, tokenId3];
  fixture.stakeAmount = stakeAmount;
  fixture.trancheIds = [[trancheId], [trancheId], [trancheId]];
  fixture.trancheId = trancheId;
}

async function generateStakeRewards(fixture) {
  const { stakingProducts, pool, cover } = fixture.contracts;

  const [coverBuyer, coverReceiver] = fixture.accounts.members;
  const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
  const { productId, period, amount } = buyCoverFixture;

  const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
  const nextBlockTimestamp = currentTimestamp + 10;
  const nxmPrice = await pool.getInternalTokenPriceInAsset(buyCoverFixture.paymentAsset);
  const product = await stakingProducts.getProduct(1, productId);
  const coverAmountAllocationsPerPool = [
    amount / 3n, // a third
    amount / 3n, // second third
    amount - (amount / 3n) * 2n, // whatever's left
  ];

  const premiumInNxmPerPool = coverAmountAllocationsPerPool.map(
    amount => calculatePremium(amount, nxmPrice, period, product.bumpedPrice, NXM_PER_ALLOCATION_UNIT).premiumInNxm,
  );

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

async function withdrawNXMSetup() {
  const fixture = await loadFixture(setup);

  // do not change the order
  await stakingPoolSetup(fixture);
  await generateStakeRewards(fixture);

  // StakingPool1 deposit params
  const stakingPoolDeposits = [];
  const stakingPoolManagerRewards = [];
  const batchSize = 0;

  return {
    ...fixture,
    stakingPoolDeposits,
    stakingPoolManagerRewards,
    batchSize,
  };
}

module.exports = {
  withdrawNXMSetup,
};
