const { ethers } = require('hardhat');

const { DAI_ASSET_ID } = require('../utils/cover');
const { daysToSeconds } = require('../utils').helpers;
const { increaseTime, setEtherBalance, setNextBlockBaseFee } = require('../utils').evm;
const { toBytes2 } = require('../utils').helpers;

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

  // mint nxm
  const tc = await ethers.getContractAt('TokenController', await stakingPool.tokenController());
  await setNextBlockBaseFee(0);
  await tc.connect(coverSigner).mint(staker.address, amount, { gasPrice: 0 });

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
  /// setup ///

  const ms = await ethers.getContractAt('NXMaster', await cover.master());
  const as = await ethers.getContractAt('Assessment', await ms.getLatestAddress(toBytes2('AS')), coverBuyer);
  const ic = await ethers.getContractAt('IndividualClaims', await ms.getLatestAddress(toBytes2('IC')), coverBuyer);
  const tc = await ethers.getContractAt('TokenController', await ms.getLatestAddress(toBytes2('TC')), coverBuyer);
  const tk = await ethers.getContractAt('NXMToken', await ms.tokenAddress(), coverBuyer);

  // get cover signer and set ether balance
  const coverSigner = await ethers.getImpersonatedSigner(cover.address);
  await setEtherBalance(coverSigner.address, parseEther('1000'));

  // mint nxm, approve infinity, stake as assessor
  const balance = Two.pow(96).sub(1);
  await setNextBlockBaseFee(0);
  await tc.connect(coverSigner).mint(coverBuyer.address, balance, { gasPrice: 0 });
  await tk.approve(tc.address, MaxUint256);
  await as.stake(balance.div(2));

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

  // const allocations = amount => [
  //   { poolId, coverAmountInAsset: amount.div(2) },
  //   { poolId: poolId.add(1), coverAmountInAsset: amount.div(2) },
  // ];

  const f = (value, units = 18, padSize = 4) => {
    const formatted = formatUnits(value, units);
    const [int, dec = ''] = formatted.split('.');
    return int + '.' + dec.slice(0, padSize).padEnd(padSize, '0');
  };

  const days = seconds => (seconds / 3600 / 24).toFixed(2) + 'd';

  /// internal functions ///

  const buy = async (requestedCoverId, amount, period) => {
    await cover.buyCover({ ...params(amount, period), coverId: requestedCoverId }, allocations(amount));
    const coverId = BigNumber.from(requestedCoverId).isZero() ? await cover.coverDataCount() : requestedCoverId;
    const segmentCount = await cover.coverSegmentsCount(coverId);
    const segment = await cover.coverSegments(coverId, segmentCount.sub(1));
    console.log(
      [
        `buy(coverId=${coverId}, amount = ${f(amount)}, period = ${days(period)})`,
        `=> amount = ${f(segment.amount)}, period = ${days(segment.period)}\n`,
      ].join(' '),
    );
  };

  const claim = async (amount, segmentId) => {
    // gather info
    const { coverAsset } = await cover.coverData(coverId);
    const { period: segmentPeriod } = await cover.coverSegments(coverId, segmentId);
    const [deposit] = await ic.getAssessmentDepositAndReward(amount, segmentPeriod, coverAsset);

    // submit claim
    await ic.submitClaim(coverId, segmentId, amount, '', { value: deposit });
    const { claimId } = await ic.lastClaimSubmissionOnCover(coverId);

    // vote
    const { assessmentId } = await ic.claims(claimId);
    await as.castVotes([assessmentId], [true], [''], 0);

    // advance time 24h and redeem payout
    await increaseTime(4 * 24 * 3600); // 3 days for voting + 1 day for cooldown
    await ic.redeemClaimPayout(claimId);

    // get updated info
    const { amountPaidOut } = await cover.coverData(coverId);

    console.log(
      [
        `claim(coverId = ${coverId}, segment = ${segmentId}, amount = ${f(amount)})`,
        `=> amountPaidOut = ${f(amountPaidOut)}\n`,
      ].join(' '),
    );
  };

  const dump = async () => {

  };

  /// initialization ///

  // buy initial cover
  await buy(0, amount, period);

  /// api ///

  const api = {
    edit: async ({ amount = 0, period = 0 } = {}) => {
      const coverSegmentCount = await cover.coverSegmentsCount(coverId);
      const lastSegmentId = coverSegmentCount.sub(1);
      const lastSegment = await cover.coverSegments(coverId, lastSegmentId);

      if (Zero.eq(period)) {
        const { timestamp } = await ethers.provider.getBlock('latest');
        period = BigNumber.from(lastSegment.start).add(lastSegment.period).sub(timestamp).add(1);
      }

      if (Zero.eq(amount)) {
        const coverData = await cover.coverData(coverId);
        amount = lastSegment.amount.sub(coverData.amountPaidOut);
      }

      await buy(coverId, amount, period);
    },

    claim: async (amount, segment = -1) => {
      const segmentId =
        BigNumber.from(segment).eq(-1) === false
          ? segment // use provided segment id
          : (await cover.coverSegmentsCount(coverId)).sub(1);
      await claim(amount, segmentId);
    },

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

    allocations: async segmentId => {
      const allocationCount = await cover.getSegmentAllocationCount(coverId, segmentId);
      const allocations = [];
      for (let i = 0; i < allocationCount; i++) {
        allocations.push(cover.coverSegmentAllocations(coverId, segmentId, i));
      }
      return Promise.all(allocations);
    },

    dump: async () => {
      const cellWidth = 14;
      const dateCellWidth = 22;

      const cell = s => `${s}`.padStart(cellWidth, ' ');
      const date = timestamp =>
        new Date(timestamp * 1000).toISOString().replace('T', ' ').replace(/\..+/, '').padStart(dateCellWidth, ' ');

      const { amountPaidOut } = await api.data();
      const segments = await api.segments();

      console.log(`dump() => ${coverId}, amount paid out = ${f(amountPaidOut)}`);
      const columns = [
        'segment id',
        'amount asset',
        'period',
        'start'.padStart(dateCellWidth),
        'end'.padStart(dateCellWidth),
        'alloc idx',
        'pool id',
        'alloc id',
        'amount nxm',
        'premium nxm',
      ];

      console.log(columns.map(cell).join(''));
      const gap = ['', '', '', ' '.repeat(dateCellWidth), ' '.repeat(dateCellWidth)].map(cell);

      for (const sid in segments) {
        const { amount, start, period } = segments[sid];
        const segmentCells = [sid, f(amount), days(period), date(start), date(start + period)];

        (await api.allocations(sid)).forEach((allocation, aid) => {
          const { poolId, coverAmountInNXM, premiumInNXM, allocationId } = allocation;
          const leftSide = aid === 0 ? segmentCells : gap;
          const cells = [...leftSide, aid, poolId, allocationId, f(coverAmountInNXM, 18, 2), f(premiumInNXM, 18, 6)];
          console.log(cells.map(cell).join(''));
        });

        console.log(''); // empty line
      }
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

    const stakingPoolTwo = await createStakingPool(this.contracts.cover, defaultSender);
    const depositTwo = await createDeposit(stakingPoolTwo, defaultSender);

    // create time object and add hook to extend deposit
    const time = await createTime();
    time.hook(() => deposit.extend());
    time.hook(() => depositTwo.extend());

    const poolId = await stakingPool.getPoolId();
    const amount = parseEther('10000');
    const period = BigNumber.from(daysToSeconds(30));

    // create cover object
    const cover = await createCover(this.contracts.cover, defaultSender, poolId, amount, period);
    await cover.dump();

    await cover.edit({ period: period.mul(2) });
    await cover.dump();

    await cover.edit({ amount: amount.div(2) });
    await cover.dump();

    await cover.claim(amount.div(2), 0);
    await cover.dump();
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
