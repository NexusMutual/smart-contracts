const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');

const { submitGovernanceProposal, submitMemberVoteGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory } = require('../utils').constants;
const { setNextBlockTime, mineNextBlock } = require('../utils').evm;

const {
  calculateRelativeError,
} = require('../utils').tokenPrice;

const { BN, toBN } = web3.utils;

const MemberRoles = artifacts.require('MemberRoles');
const Pool = artifacts.require('Pool');
const OldPool = artifacts.require('P1MockOldPool');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const LegacyMCR = artifacts.require('LegacyMCR');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ERC20 = artifacts.require('@openzeppelin/contracts-v4/token/ERC20/ERC20.sol:ERC20');
const SwapOperator = artifacts.require('SwapOperator');
const LegacyPoolData = artifacts.require('LegacyPoolData');
const TwapOracle = artifacts.require('TwapOracle');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  SAI: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
  WNXM: '0x0d438F3b5175Bebc262bF23753C1E53d03432bDE',
  DAIFEED: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  UNIFACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
  stETH: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
};

const UserAddress = {
  NXM_WHALE_1: '0x25783b67b5e29c48449163db19842b8531fdde43',
  NXM_WHALE_2: '0x598dbe6738e0aca4eabc22fed2ac737dbd13fb8f',
};

const ratioScale = toBN('10000');

let isHardhat;
const hardhatRequest = async (...params) => {

  if (isHardhat === undefined) {
    const nodeInfo = await web3.eth.getNodeInfo();
    isHardhat = !!nodeInfo.match(/Hardhat/);
  }

  if (isHardhat) {
    return network.provider.request(...params);
  }
};

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const fund = async to => web3.eth.sendTransaction({ from: accounts[0], to, value: ether('1000000') });
const unlock = async member => hardhatRequest({ method: 'hardhat_impersonateAccount', params: [member] });

const bnToNumber = bn => parseInt(bn.toString(), 10);

describe('MCR on-chain migration', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const masterAddress = getAddressByCode('NXMASTER');
    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const governance = await Governance.at(getAddressByCode('GV'));
    const pool1 = await OldPool.at(getAddressByCode('P1'));
    const oldMCR = await LegacyMCR.at(getAddressByCode('MC'));
    const oldPoolData = await LegacyPoolData.at(getAddressByCode('PD'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.oldPool = pool1;
    this.oldMCR = oldMCR;
    this.getAddressByCode = getAddressByCode;
    this.master = await NXMaster.at(masterAddress);
    this.poolData = oldPoolData;
  });

  it('fetches board members and funds accounts', async function () {

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(0, 3);

    const whales = [UserAddress.NXM_WHALE_1, UserAddress.NXM_WHALE_2];

    for (const member of [...voters, Address.NXMHOLDER, ...whales]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
    this.whales = whales;
  });

  it('upgrade contracts', async function () {

    const { governance, voters, oldMCR, getAddressByCode, oldPool, master, poolData } = this;

    const dai = await ERC20.at(Address.DAI);

    const poolValueBefore = await oldPool.getPoolValueInEth();

    const p1EthBefore = await web3.eth.getBalance(oldPool.address);
    const p1DaiBefore = await dai.balanceOf(oldPool.address);

    const tokenSpotPriceEthBefore = await oldPool.getTokenPrice(Address.ETH);
    const tokenSpotPriceDaiBefore = await oldPool.getTokenPrice(Address.DAI);

    /* MCR data */
    const previousVariableMincap = await oldMCR.variableMincap();
    const previousDynamicMincapThresholdx100 = await oldMCR.dynamicMincapThresholdx100();
    const previousDynamicMincapIncrementx100 = await oldMCR.dynamicMincapIncrementx100();
    const previousAllSumAssurance = await oldMCR.getAllSumAssurance();

    /* PoolData data */
    const minCap = await poolData.minCap();

    console.log('Deploying contracts');

    /*
    Upgrade list:
    contracts/modules/capital/MCR.sol
    contracts/modules/capital/Pool.sol
    contracts/modules/claims/ClaimsReward.sol
    contracts/modules/cover/Quotation.sol

    New contract:
    SwapOperator
    */

    const newMCR = await MCR.new(master.address);
    const newClaimsReward = await ClaimsReward.new(master.address, Address.DAI);
    const newQuotation = await Quotation.new();

    console.log('Fetch price feed oracle');
    const oldPriceFeedOracle = await PriceFeedOracle.at(await oldPool.priceFeedOracle());
    const daiAggregator = await oldPriceFeedOracle.aggregators(dai.address);
    const priceFeedOracle = await PriceFeedOracle.new([dai.address], [daiAggregator], dai.address);

    console.log('Fetch twap oracle');
    const twapOracle = await TwapOracle.at(await oldPool.twapOracle());

    const stETHToken = await ERC20.at(Address.stETH);

    const swapController = UserAddress.NXM_WHALE_2;

    const swapOperator = await SwapOperator.new(master.address, twapOracle.address, swapController, stETHToken.address);

    console.log('Deploy pool');
    const pool = await Pool.new(
      [Address.DAI, Address.stETH],
      [ether('1000000'), ether('1')],
      [ether('2000000'), ether('10000000')],
      [ether('0.025'), ether('0.025')],
      master.address,
      priceFeedOracle.address,
      swapOperator.address,
    );

    const actionData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['MC', 'QT', 'CR', 'P1'].map(hex),
        [newMCR, newQuotation, newClaimsReward, pool].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      actionData,
      voters,
      governance,
    );

    const storedMCRAddress = await master.getLatestAddress(hex('MC'));
    const storedCRAddress = await master.getLatestAddress(hex('CR'));
    const storedQTAddress = await master.getLatestAddress(hex('QT'));
    const storedP1Address = await master.getLatestAddress(hex('P1'));

    assert.equal(storedCRAddress, newClaimsReward.address);
    assert.equal(storedQTAddress, newQuotation.address);
    assert.equal(storedMCRAddress, newMCR.address);
    assert.equal(storedP1Address, pool.address);

    console.log('Successfully upgraded');

    /* MCR parameters */

    const mcrFloor = await newMCR.mcrFloor();
    const mcrFloorIncrementThreshold = await newMCR.mcrFloorIncrementThreshold();
    const maxMCRFloorIncrement = await newMCR.maxMCRFloorIncrement();
    const allSumAssurance = await newMCR.getAllSumAssurance();

    const minCapFactor = ether('1000');
    const expectedMCRFloor = minCap.mul(minCapFactor).add(previousVariableMincap);
    assert.equal(mcrFloor.toString(), expectedMCRFloor.toString());
    assert.equal(mcrFloorIncrementThreshold.toString(), previousDynamicMincapThresholdx100.toString());
    assert.equal(maxMCRFloorIncrement.toString(), previousDynamicMincapIncrementx100.toString());
    assert.equal(allSumAssurance.toString(), previousAllSumAssurance.toString());

    /* Check old pools' balances */
    const oldPool1EthBalanceAfter = await web3.eth.getBalance(oldPool.address);
    const oldPool1DaiBalanceAfter = await dai.balanceOf(oldPool.address);
    assert.equal(oldPool1EthBalanceAfter.toString(), '0');
    assert.equal(oldPool1DaiBalanceAfter.toString(), '0');

    const poolEthAfter = await web3.eth.getBalance(pool.address);
    const poolDaiAfter = await dai.balanceOf(pool.address);

    const expectedEth = toBN(p1EthBefore);
    const expectedDai = p1DaiBefore;

    assert.equal(poolEthAfter, expectedEth.toString());
    assert.equal(poolDaiAfter.toString(), expectedDai.toString());

    /* Token spot price checks */
    const tokenSpotPriceEthAfter = await pool.getTokenPrice(Address.ETH);
    const tokenSpotPriceDaiAfter = await pool.getTokenPrice(Address.DAI);

    const priceFeedRate = await priceFeedOracle.getAssetToEthRate(Address.DAI);
    const poolValueAfter = await pool.getPoolValueInEth();

    const priceFeedRateStEth = await priceFeedOracle.getAssetToEthRate(Address.stETH);

    console.log({
      priceFeedRate: priceFeedRate.toString(),
      priceFeedRateStEth: priceFeedRateStEth.toString(),
      poolValueBefore: poolValueBefore.toString(),
      poolValueAfter: poolValueAfter.toString(),
      poolEthBalanceBefore: expectedEth.toString(),
      poolDaiBalanceBefore: expectedDai.toString(),
      poolEthBalanceAfter: poolEthAfter.toString(),
      poolDaiBalanceAfter: poolDaiAfter.toString(),
    });

    console.log({
      tokenSpotPriceEthBefore: tokenSpotPriceEthBefore.toString(),
      tokenSpotPriceEthAfter: tokenSpotPriceEthAfter.toString(),
      tokenSpotPriceDaiBefore: tokenSpotPriceDaiBefore.toString(),
      tokenSpotPriceDaiAfter: tokenSpotPriceDaiAfter.toString(),
    });

    const poolValueDiff = poolValueBefore.sub(poolValueAfter).abs();
    const maxDiff = ether('0.1');
    assert(poolValueDiff.lt(maxDiff), `Expected pool value < 0.1 ETH, got: ${poolValueDiff.toString()}`);

    const relativeErrorEthSpotPrice = calculateRelativeError(tokenSpotPriceEthAfter, tokenSpotPriceEthBefore);
    assert(
      relativeErrorEthSpotPrice.lt(new Decimal(0.0005)),
      `old token ETH spot price ${tokenSpotPriceEthBefore.toString()} differs too much from ${tokenSpotPriceEthAfter.toString()}
      relative error; ${relativeErrorEthSpotPrice}`,
    );

    const relativeErrorDaiSpotPrice = calculateRelativeError(tokenSpotPriceDaiAfter, tokenSpotPriceDaiBefore);
    assert(
      relativeErrorDaiSpotPrice.lt(new Decimal(0.0005)),
      `old token DAI spot price ${tokenSpotPriceDaiBefore.toString()} differs too much from ${tokenSpotPriceDaiAfter.toString()}
      relative error: ${relativeErrorDaiSpotPrice.toString()}`,
    );

    const mcr = newMCR;
    const lastUpdateTime = await mcr.lastUpdateTime();
    const desiredMCR = await mcr.desiredMCR();
    const storedMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    console.log({
      lastUpdateTime: lastUpdateTime.toString(),
      desiredMCR: desiredMCR.toString(),
      storedMCR: storedMCR.toString(),
      currentMCR: currentMCR.toString(),
      mcrFloor: mcrFloor.toString(),
      mcrFloorIncrementThreshold: mcrFloorIncrementThreshold.toString(),
      maxMCRFloorIncrement: maxMCRFloorIncrement.toString(),
    });

    this.priceFeedOracle = priceFeedOracle;
    this.pool = pool;
    this.twapOracle = twapOracle;
    this.dai = dai;
    this.mcr = mcr;
    this.swapController = swapController;
    this.swapOperator = swapOperator;
    this.stETHToken = stETHToken;
    this.twapOracle = twapOracle;
  });

  it('triggers StEth investment', async function () {
    const { swapOperator, swapController, stETHToken, pool } = this;

    const poolValueInEthBefore = await pool.getPoolValueInEth();

    const amountIn = ether('100');
    await swapOperator.swapETHForStETH(amountIn, {
      from: swapController,
    });

    const balanceAfter = await stETHToken.balanceOf(pool.address);

    const dustDifference = 2;
    assert.equal(balanceAfter.toString(), amountIn.subn(dustDifference).toString());

    const poolValueInEthAfter = await pool.getPoolValueInEth();

    const poolValueDelta = poolValueInEthBefore.sub(poolValueInEthAfter);

    assert(poolValueDelta.ltn(20), 'poolValueDelta exceeds 20 wei');
  });

  it('trigger ETH -> DAI swap', async function () {
    const { swapOperator, swapController, twapOracle, pool, dai } = this;

    const amountIn = ether('40');

    const wethDAIPairAddress = await twapOracle.pairFor(Address.WETH, Address.DAI);

    const periodSize = 1800;
    const windowSize = 14400; // = 8 * 1800 = 4 hours
    const nextWindowStartTime = async () => {
      const now = bnToNumber(await time.latest());
      const currentWindow = Math.floor(now / windowSize);
      return (currentWindow + 1) * windowSize;
    };

    const windowStart = await nextWindowStartTime();
    console.log({
      wethDAIPairAddress,
    });
    const now = bnToNumber(await time.latest());
    console.log({
      now,
    });
    await setNextBlockTime(windowStart);

    await twapOracle.update([wethDAIPairAddress]);
    const now2 = bnToNumber(await time.latest());
    console.log({
      windowStart,
      now2,
    });

    // should be able to swap only during the last period within the window
    const period8Start = windowStart + periodSize * 7;
    const period8End = windowStart + windowSize - 1;
    await setNextBlockTime(period8Start);
    const now3 = bnToNumber(await time.latest());
    console.log({
      period8Start,
      now3,
    });

    // mine block
    await web3.eth.sendTransaction({ from: accounts[0], to: pool.address, value: '1' });

    const daiBalanceBefore = await dai.balanceOf(pool.address);

    const assetData = await pool.assetData(Address.DAI);

    const avgAmountOut = await twapOracle.consult(Address.WETH, amountIn, Address.DAI);
    const maxSlippageAmount = avgAmountOut.mul(assetData.maxSlippageRatio).div(ether('1'));
    const minOutOnMaxSlippage = avgAmountOut.sub(maxSlippageAmount);

    console.log({
      minOutOnMaxSlippage: minOutOnMaxSlippage.toString(),
    });
    await swapOperator.swapETHForAsset(Address.DAI, amountIn, minOutOnMaxSlippage, {
      from: swapController,
    });

    const daiBalanceAfter = await dai.balanceOf(pool.address);

    const balanceIncrease = daiBalanceAfter.sub(daiBalanceBefore);

    console.log({
      balanceIncrease: balanceIncrease.toString(),
    });
  });

  it('triggers MCR update (no-effect at floor level)', async function () {
    const { mcr } = this;

    const minUpdateTime = await mcr.minUpdateTime();
    await time.increase(minUpdateTime.addn(1));

    const mcrFloorBefore = await mcr.mcrFloor();
    const desiredMCRBefore = await mcr.desiredMCR();
    const storedMCRBefore = await mcr.mcr();
    const currentMCRBefore = await mcr.getMCR();
    await mcr.updateMCR();

    const block = await web3.eth.getBlock('latest');

    const lastUpdateTime = await mcr.lastUpdateTime();
    const mcrFloor = await mcr.mcrFloor();
    const desiredMCR = await mcr.desiredMCR();
    const storedMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    console.log({
      desiredMCR: desiredMCR.toString(),
      currentMCR: currentMCR.toString(),
      storedMCR: storedMCR.toString(),
    });

    assert.equal(lastUpdateTime.toString(), block.timestamp.toString());
    assert.equal(mcrFloor.toString(), mcrFloorBefore.toString());
    assert.equal(desiredMCR.toString(), mcrFloor.toString());

    // desiredMCR falls slightly since the current MCR is slightly above the floor.
    assert(desiredMCR.lt(desiredMCRBefore), 'desiredMCR did not decrease');

    this.lastUpdateTime = lastUpdateTime;
  });

  it('sets DMCI to greater to 1% to allow floor increase', async function () {
    const { voters, governance, mcr, whales } = this;

    const newMaxMCRFloorIncrement = toBN(100);
    const parameters = [
      ['bytes8', hex('DMCI')],
      ['uint', newMaxMCRFloorIncrement],
    ];

    const updateParams = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    await submitMemberVoteGovernanceProposal(
      ProposalCategory.upgradeMCRParameters, updateParams, [...voters, ...whales], governance,
    );

    const maxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();

    assert.equal(maxMCRFloorIncrement.toString(), newMaxMCRFloorIncrement.toString());
  });

  it('triggers MCR update after ETH injection to the pool to MCR% > 130%', async function () {
    const { mcr, lastUpdateTime: prevUpdateTime, pool } = this;

    const minUpdateTime = await mcr.minUpdateTime();

    const currentMCR = await mcr.getMCR();

    const extraEth = currentMCR.muln(140).divn(100);
    console.log(`Funding Pool at ${pool.address} with ${extraEth.div(ether('1'))} ETH.`);
    await web3.eth.sendTransaction({ from: accounts[0], to: pool.address, value: extraEth });

    const mcrFloorBefore = await mcr.mcrFloor();
    const currentMCRBefore = await mcr.getMCR();

    await time.increase(time.duration.hours(24));
    await mcr.updateMCR();

    const block = await web3.eth.getBlock('latest');

    const lastUpdateTime = await mcr.lastUpdateTime();
    const mcrFloor = await mcr.mcrFloor();
    const desiredMCR = await mcr.desiredMCR();
    const storedMCR = await mcr.mcr();
    const latestMCR = await mcr.getMCR();
    const maxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();

    const expectedMCRFloor = mcrFloorBefore.mul(ratioScale.add(maxMCRFloorIncrement)).divn(ratioScale);

    console.log({
      mcrFloor: mcrFloor.toString(),
      desiredMCR: desiredMCR.toString(),
      latestMCR: latestMCR.toString(),
    });

    assert.equal(lastUpdateTime.toString(), block.timestamp.toString());
    assert.equal(mcrFloor.toString(), expectedMCRFloor.toString());
    assert.equal(desiredMCR.toString(), mcrFloor.toString());
    assert.equal(currentMCRBefore.toString(), latestMCR.toString());
  });
});
