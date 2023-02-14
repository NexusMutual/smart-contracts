const { ethers } = require('hardhat');

const { DAI_ASSET_ID } = require('../utils/cover');
const { daysToSeconds } = require('../utils').helpers;
const { increaseTime, setEtherBalance } = require('../utils').evm;

const { BigNumber } = ethers;
const { AddressZero, Zero, Two, MaxUint256 } = ethers.constants;
const { formatUnits, parseEther } = ethers.utils;

const createTime = async (callbacks = []) => {
  const hooks = [...callbacks];

  const api = {
    increase: async seconds => {
      await increaseTime(seconds);
      for (const hook of hooks) {
        await hook();
      }
    },

    hook: callback => {
      hooks.push(callback);
    },

    unhook: callback => {
      const index = hooks.indexOf(callback);
      index !== -1 && hooks.splice(index, 1);
    },
  };

  return api;
};

const createStakingPool = async (cover, manager) => {
  const product = { productId: 0, weight: 100, initialPrice: 100, targetPrice: 100 };

  await cover
    .connect(manager)
    // manager, isPrivate, poolFee, maxPoolFee, initialProducts, ipfs
    .createStakingPool(manager.address, false, 0, 0, [product], '');

  const factoryAddress = await cover.stakingPoolFactory();
  const factory = await ethers.getContractAt('StakingPoolFactory', factoryAddress);

  const id = await factory.stakingPoolCount();
  const stakingPoolAddress = await cover.stakingPool(id);

  return await ethers.getContractAt('StakingPool', stakingPoolAddress);
};

const createDeposit = async (stakingPool, staker) => {
  // get cover signer
  const coverAddress = await stakingPool.coverContract();
  const amount = Two.pow(96).sub(1);
  const coverSigner = await ethers.getImpersonatedSigner(coverAddress);
  await setEtherBalance(coverSigner.address, parseEther('1000'));

  // mint nxm
  const tc = await ethers.getContractAt('TokenController', await stakingPool.tokenController());
  await tc.connect(coverSigner).mint(staker.address, amount);

  // make infinite approval
  const tk = await ethers.getContractAt('NXMToken', await tc.token());
  await tk.approve(tc.address, MaxUint256);

  const { timestamp } = await ethers.provider.getBlock('latest');
  const maxTrancheId = Math.floor(timestamp / (91 * 24 * 3600)) + 7;

  // Stake to open up capacity
  const depositTx = await stakingPool.depositTo(amount, maxTrancheId, 0, AddressZero);
  const { events: depositEvents } = await depositTx.wait();
  const { tokenId } = depositEvents.find(e => e.event === 'StakeDeposited').args;

  let lastTrancheId = maxTrancheId;

  const api = {
    extend: async () => {
      const { timestamp } = await ethers.provider.getBlock('latest');
      const maxTrancheId = Math.floor(timestamp / (91 * 24 * 3600)) + 7;
      if (maxTrancheId !== lastTrancheId) {
        await stakingPool.extendDeposit(tokenId, lastTrancheId, maxTrancheId, 0);
        lastTrancheId = maxTrancheId;
      }
    },
  };

  return api;
};

const createCover = async (cover, coverBuyer, poolId, amount, period) => {
  // get next cover id
  const coverId = (await cover.coverDataCount()).add(1);

  // params factory
  const params = (amount, period) => ({
    owner: coverBuyer.address,
    coverId,
    productId: 0,
    amount,
    period,
    coverAsset: DAI_ASSET_ID,
    maxPremiumInAsset: MaxUint256,
    paymentAsset: DAI_ASSET_ID,
    commissionRatio: parseEther('0'),
    commissionDestination: AddressZero,
    ipfsData: '',
  });

  // allocations factory
  const allocations = amount => [{ poolId, coverAmountInAsset: amount }];
  const f = (value, units = 18) => formatUnits(value, units);

  const buy = async (requestedCoverId, amount, period) => {
    console.log(`buy(coverId=${requestedCoverId}, amount=${f(amount)}, period=${f(period, 0)})`);
    await cover.buyCover({ ...params(amount, period), coverId: requestedCoverId }, allocations(amount));
    const coverId = await cover.coverDataCount();
    const segmentCount = await cover.coverSegmentsCount(coverId);
    const segment = await cover.coverSegments(coverId, segmentCount.sub(1));
    console.log(`=> amount=${f(segment.amount)}, period=${f(segment.period, 0)})\n`);
  };

  // buy initial cover
  await buy(0, amount, period);

  const api = {
    edit: async ({ amount = 0, period = 0 } = {}) => {
      const coverSegmentCount = await cover.coverSegmentsCount(coverId);
      const lastSegmentId = coverSegmentCount.sub(1);
      const lastSegment = await cover.coverSegments(coverId, lastSegmentId);

      if (Zero.eq(period)) {
        const { timestamp } = await ethers.provider.getBlock('latest');
        period = BigNumber.from(lastSegment.start).add(lastSegment.period).sub(timestamp).add(1);
      }

      if (amount === 0) {
        const coverData = await cover.coverData(coverId);
        amount = lastSegment.amount.sub(coverData.amountPaidOut);
      }

      await buy(coverId, amount, period);
    },

    claim: async (amount, segment = -1) => {},

    data: async () => cover.coverData(coverId),

    segment: async i => cover.coverSegments(coverId, i),

    segments: async () => {
      const segmentCount = (await cover.coverSegmentsCount(coverId)).toNumber();
      const segments = [];
      for (let i = 0; i < segmentCount; i++) {
        segments.push(await cover.coverSegments(coverId, i));
      }
      return segments;
    },

    allocations: async () => {
      const segments = await this.segments();
      return Promise.all(segments.map((_, id) => cover.coverSegmentAllocations(coverId, id)));
    },

    dump: async () => {
      const data = await this.data();
      const segments = await this.segments();
      const allocations = await this.allocations();
      console.log({ data, segments, allocations });
    },
  };

  return api;
};

describe('cover burns playground', function () {
  before(async function () {
    // infinite dai for cover buys
    const { cover, dai } = this.contracts;
    await dai.mint(this.accounts.defaultSender.address, Two.pow(96).sub(1));
    await dai.approve(cover.address, MaxUint256);
  });

  it('example', async function () {
    const { defaultSender } = this.accounts;

    // infinite dai for the cover buyer
    await this.contracts.dai.mint(defaultSender.address, Two.pow(96).sub(1));
    await this.contracts.dai.approve(this.contracts.cover.address, MaxUint256);

    // create staking pool and infinite deposit
    const stakingPool = await createStakingPool(this.contracts.cover, defaultSender);
    const deposit = await createDeposit(stakingPool, defaultSender);

    // create time object and add hook to extend deposit
    const time = await createTime();
    time.hook(() => deposit.extend());

    const poolId = await stakingPool.getPoolId();
    const amount = parseEther('10');
    const period = BigNumber.from(daysToSeconds(30));

    // create cover object
    const cover = await createCover(this.contracts.cover, defaultSender, poolId, amount, period);

    await cover.edit({ period: period.mul(2) });
    await cover.edit({ amount: amount.div(2) });
    // await cover.claim(amount.div(2), -1); // claim on last segment
  });

  it.skip('should buy, wait 30 days, edit cover, claim immediately', async function () {});
  it.skip('should buy, edit, claim', async function () {});
  it.skip('should buy, edit to increase amount, claim twice', async function () {});
  it.skip('should buy, edit to increase amount, claim on previous segment', async function () {});
  it.skip('should buy, wait 1 bucket, edit, claim', async function () {});
  it.skip('should buy, wait 30 days, edit cover, wait 30 days, claim', async function () {});
  it.skip('should buy, wait 30 days, edit cover, wait until expiration is processed, claim', async function () {});
  it.skip('should buy 10 ETH cover, edit cover to 2ETH, claim 4ETH, edit cover again to 2ETH', async function () {
    // TODO: test whether final amount is 2ETH ... maybe should finalize cover and prevent last edit
  });
});
