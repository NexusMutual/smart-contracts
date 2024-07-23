const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');

const setup = require('../setup');
const { setEtherBalance, setNextBlockTime, impersonateAccount } = require('../utils').evm;
const { calculatePremium } = require('../utils/cover');
const { calculateFirstTrancheId } = require('../utils/staking');
const { daysToSeconds } = require('../../../lib/helpers');
const { getInternalPrice } = require('../../utils/rammCalculations');

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};
const buyCoverFixture = {
  coverId: 0,
  owner: AddressZero,
  productId: stakedProductParamTemplate.productId,
  coverAsset: 0b0,
  amount: parseEther('1'),
  period: daysToSeconds(30),
  maxPremiumInAsset: MaxUint256,
  paymentAsset: 0b0,
  commissionRatio: 0,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

async function stakingPoolSetup(fixture) {
  const { stakingPool1, stakingPool2, stakingPool3, stakingProducts, tc: tokenController, tk: nxm } = fixture.contracts;
  const [manager1, manager2, manager3] = fixture.accounts.stakingPoolManagers;

  const operatorAddress = await nxm.operator();
  await impersonateAccount(operatorAddress);
  const operator = await ethers.provider.getSigner(operatorAddress);

  await setEtherBalance(manager1.address, parseEther('10000'));
  await setEtherBalance(operatorAddress, parseEther('10000'));

  // mint and set allowance
  await nxm.connect(operator).mint(manager1.address, parseEther('10000000'));
  await nxm.connect(operator).mint(manager2.address, parseEther('10000000'));
  await nxm.connect(manager1).approve(tokenController.address, ethers.constants.MaxUint256);

  // set products
  await stakingProducts.connect(manager1).setProducts(1, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager2).setProducts(2, [stakedProductParamTemplate]);
  await stakingProducts.connect(manager3).setProducts(3, [stakedProductParamTemplate]);

  // stake
  const stakeAmount = parseEther('900000');
  const latestBlock = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = calculateFirstTrancheId(latestBlock, buyCoverFixture.period, 0);

  const depositParams = [stakeAmount, firstActiveTrancheId + 5, 0, manager1.address];
  const tokenId1 = await stakingPool1.connect(manager1).callStatic.depositTo(...depositParams);
  const tokenId2 = await stakingPool2.connect(manager1).callStatic.depositTo(...depositParams);
  const tokenId3 = await stakingPool3.connect(manager1).callStatic.depositTo(...depositParams);

  await stakingPool1.connect(manager1).depositTo(...depositParams);
  await stakingPool2.connect(manager1).depositTo(...depositParams);
  await stakingPool3.connect(manager1).depositTo(...depositParams);

  fixture.tokenIds = [tokenId1, tokenId2, tokenId3];
  fixture.stakeAmount = stakeAmount;
}

async function buyCoverSetup(fixture) {
  const { stakingProducts, tc: tokenController, p1: pool, ra: ramm, mcr, cover } = fixture.contracts;

  const [coverBuyer, coverReceiver] = fixture.accounts.members;
  const { NXM_PER_ALLOCATION_UNIT } = fixture.config;
  const { productId, period, amount } = buyCoverFixture;

  const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
  const nextBlockTimestamp = currentTimestamp + 10;
  const ethRate = await getInternalPrice(ramm, pool, tokenController, mcr, nextBlockTimestamp);

  const product = await stakingProducts.getProduct(1, productId);
  const { premiumInAsset: premium } = calculatePremium(
    amount,
    ethRate,
    period,
    product.bumpedPrice,
    NXM_PER_ALLOCATION_UNIT,
  );
  const coverAmountAllocationPerPool = amount.div(3);

  await setNextBlockTime(nextBlockTimestamp);
  await cover.connect(coverBuyer).buyCover(
    { ...buyCoverFixture, owner: coverReceiver.address, maxPremiumInAsset: premium },
    [
      { poolId: 1, coverAmountInAsset: coverAmountAllocationPerPool },
      { poolId: 2, coverAmountInAsset: coverAmountAllocationPerPool },
      { poolId: 3, coverAmountInAsset: coverAmountAllocationPerPool },
    ],
    { value: premium },
  );
}

async function assessmentStakeSetup(fixture) {
  const { ci: individualClaims, as: assessment } = fixture.contracts;
  const [manager1, manager2] = fixture.accounts.stakingPoolManagers;
  const coverReceiver = fixture.accounts.members[1];

  // stake
  await assessment.connect(manager1).stake(fixture.stakeAmount);
  await assessment.connect(manager2).stake(fixture.stakeAmount);

  // claim
  await individualClaims.connect(coverReceiver).submitClaim(1, 0, parseEther('1'), '', { value: parseEther('1') });

  // vote
  await assessment.connect(manager1).castVotes([0], [true], ['Assessment data hash'], 0);
  await assessment.connect(manager2).castVotes([0], [true], ['Assessment data hash'], 0);
}

async function nexusViewerSetup() {
  const fixture = await loadFixture(setup);

  // do not change the order
  await stakingPoolSetup(fixture);
  await buyCoverSetup(fixture);
  await assessmentStakeSetup(fixture);

  return fixture;
}

module.exports = {
  nexusViewerSetup,
};
