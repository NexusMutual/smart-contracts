const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { expectRevert, constants: { ZERO_ADDRESS }, ether, time } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');

const { submitGovernanceProposal, submitMemberVoteGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, Role } = require('../utils').constants;
const { setNextBlockTime } = require('../utils').evm;
const { bnEqual } = require('../utils').helpers;

const {
  calculateRelativeError,
} = require('../utils').tokenPrice;
const { quoteAuthAddress } = require('../utils').getQuote;
const { buyCover, buyCoverWithDai } = require('../utils').buyCover;

const { toBN } = web3.utils;

const MemberRoles = artifacts.require('MemberRoles');
const Pool = artifacts.require('Pool');
const OldPool = artifacts.require('P1MockOldPool');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const Claims = artifacts.require('Claims');
const MCR = artifacts.require('MCR');
const LegacyMCR = artifacts.require('LegacyMCR');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ERC20 = artifacts.require('@openzeppelin/contracts-v4/token/ERC20/ERC20.sol:ERC20');
const SwapOperator = artifacts.require('SwapOperator');
const LegacyPoolData = artifacts.require('LegacyPoolData');
const TwapOracle = artifacts.require('TwapOracle');
const Incidents = artifacts.require('Incidents');
const Gateway = artifacts.require('Gateway');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');

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
  NXM_AB_MEMBER: '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
};

const DAI_HOLDER = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';

const ybDAIProductId = '0x000000000000000000000000000000000000000d';
const ybETHProductId = '0x000000000000000000000000000000000000000e';

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

let ybDAI, ybETH;
const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const fund = async to => web3.eth.sendTransaction({ from: accounts[0], to, value: ether('1000000') });
const unlock = async member => hardhatRequest({ method: 'hardhat_impersonateAccount', params: [member] });
const bnToNumber = bn => parseInt(bn.toString(), 10);

describe('MCR on-chain migration', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const versionDataURL = 'https://api.nexusmutual.io/version-data/data.json';
    const { mainnet: { abis } } = await fetch(versionDataURL).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const masterAddress = getAddressByCode('NXMASTER');
    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const governance = await Governance.at(getAddressByCode('GV'));
    const pool1 = await OldPool.at(getAddressByCode('P1'));
    const oldMCR = await LegacyMCR.at(getAddressByCode('MC'));
    const oldPoolData = await LegacyPoolData.at(getAddressByCode('PD'));
    const quotationData = await QuotationData.at(getAddressByCode('QD'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.oldPool = pool1;
    this.oldMCR = oldMCR;
    this.master = await NXMaster.at(masterAddress);
    this.poolData = oldPoolData;
    this.quotationData = quotationData;
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

    const { governance, voters, oldMCR, oldPool, master, poolData } = this;

    const dai = await ERC20MintableDetailed.at(Address.DAI);

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

    /*
      Upgraded non-proxy contracts:  MCR, Pool, ClaimsReward, Quotation
      Upgraded proxy contracts:      Gateway
      New internal contract:         Incidents
      New contract:                  SwapOperator
    */

    console.log('Deploying contracts');

    const mcr = await MCR.new(master.address);
    const claimsReward = await ClaimsReward.new(master.address, Address.DAI);
    const quotation = await Quotation.new();
    const claims = await Claims.new();

    const oldPriceFeedOracle = await PriceFeedOracle.at(await oldPool.priceFeedOracle());
    const daiAggregator = await oldPriceFeedOracle.aggregators(dai.address);
    const priceFeedOracle = await PriceFeedOracle.new([dai.address], [daiAggregator], dai.address);

    const twapOracle = await TwapOracle.at(await oldPool.twapOracle());
    const stETHToken = await ERC20.at(Address.stETH);
    const swapController = UserAddress.NXM_WHALE_2;
    const swapOperator = await SwapOperator.new(
      master.address, twapOracle.address, swapController, stETHToken.address,
    );

    const pool = await Pool.new(
      [Address.DAI, Address.stETH],
      [ether('1000000'), ether('1')],
      [ether('2000000'), ether('10000000')],
      [ether('0.025'), ether('0.025')],
      master.address,
      priceFeedOracle.address,
      swapOperator.address,
    );

    const incidentsImplementation = await Incidents.new();
    const gateway = await Gateway.new();

    console.log('Adding new internal contract');

    const addInternalContractData = web3.eth.abi.encodeParameters(
      // contract name, address and type
      // type = 1 if contract is upgradable, 2 if contract is proxy, any other uint if none
      ['bytes2', 'address', 'uint'],
      [hex('IC'), incidentsImplementation.address, 2],
    );

    await submitGovernanceProposal(
      ProposalCategory.newContract,
      addInternalContractData,
      voters,
      governance,
    );

    const incidentProxyAddress = await master.getLatestAddress(hex('IC'));
    assert.notStrictEqual(incidentProxyAddress, ZERO_ADDRESS);
    assert.notStrictEqual(incidentProxyAddress, incidentsImplementation.address);

    const incidentsProxy = await OwnedUpgradeabilityProxy.at(incidentProxyAddress);
    const implementationAddress = await incidentsProxy.implementation();
    assert.strictEqual(implementationAddress, incidentsImplementation.address);

    const incidents = await Incidents.at(incidentProxyAddress);
    await incidents.initialize();

    console.log('Upgrading non-proxy contracts');

    const upgradeNonProxyData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['MC', 'QT', 'CR', 'P1', 'CL'].map(hex),
        [mcr, quotation, claimsReward, pool, claims].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradeNonProxyData,
      voters,
      governance,
    );

    console.log('Upgrading non-proxy contracts');

    const upgradeProxyData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['GW'].map(hex),
        [gateway].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeProxy,
      upgradeProxyData,
      voters,
      governance,
    );

    const storedMCRAddress = await master.getLatestAddress(hex('MC'));
    const storedCRAddress = await master.getLatestAddress(hex('CR'));
    const storedQTAddress = await master.getLatestAddress(hex('QT'));
    const storedCLAddress = await master.getLatestAddress(hex('CL'));
    const storedP1Address = await master.getLatestAddress(hex('P1'));

    assert.equal(storedCRAddress, claimsReward.address);
    assert.equal(storedQTAddress, quotation.address);
    assert.equal(storedCLAddress, claims.address);
    assert.equal(storedMCRAddress, mcr.address);
    assert.equal(storedP1Address, pool.address);

    console.log('Freeing up held covers');
    await quotation.freeUpHeldCovers();

    const quotationEthBalance = await web3.eth.getBalance(quotation.address);
    const quotationDaiBalance = await dai.balanceOf(quotation.address);

    assert.strictEqual(quotationEthBalance.toString(), '0');
    assert.strictEqual(quotationDaiBalance.toString(), '0');

    console.log('Held covers freed up');

    /* MCR parameters */

    const mcrFloor = await mcr.mcrFloor();
    const mcrFloorIncrementThreshold = await mcr.mcrFloorIncrementThreshold();
    const maxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();
    const allSumAssurance = await mcr.getAllSumAssurance();

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
      `old token ETH spot price ${tokenSpotPriceEthBefore.toString()} differs too much from ` +
      `${tokenSpotPriceEthAfter.toString()} relative error; ${relativeErrorEthSpotPrice}`,
    );

    const relativeErrorDaiSpotPrice = calculateRelativeError(
      tokenSpotPriceDaiAfter,
      tokenSpotPriceDaiBefore,
    );
    assert(
      relativeErrorDaiSpotPrice.lt(new Decimal(0.0005)),
      `old token DAI spot price ${tokenSpotPriceDaiBefore.toString()} differs too much from ` +
      ` ${tokenSpotPriceDaiAfter.toString()} relative error: ${relativeErrorDaiSpotPrice.toString()}`,
    );

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
    this.incidents = incidents;
    this.swapController = swapController;
    this.swapOperator = swapOperator;
    this.stETHToken = stETHToken;
    this.twapOracle = twapOracle;
    this.quotation = quotation;
  });

  it('add proposal categories for incidents contract', async function () {
    const { governance, voters } = this;

    // add incident proposal category
    {
      const parameters = [
        ['string', 'Add incident'], // name
        ['uint256', Role.AdvisoryBoard], // member role that votes
        ['uint256', 60], // majority vote percentage
        ['uint256', 15], // quorum percentage
        ['uint256[]', [Role.AdvisoryBoard]], // allowed to create proposal
        ['uint256', 3 * 24 * 3600], // closing time 3 days
        ['string', ''], // action hash - probably ipfs hash
        ['address', '0x0000000000000000000000000000000000000000'], // contract address: used only if next is "EX"
        ['bytes2', hex('IC')], // contract name
        // "incentives" is [min stake, incentive, ab voting req, special resolution]
        ['uint256[]', [0, 0, 1, 0]],
        ['string', 'addIncident(address,uint256,uint256)'], // function signature
      ];

      const actionData = web3.eth.abi.encodeParameters(
        parameters.map(p => p[0]),
        parameters.map(p => p[1]),
      );

      await submitGovernanceProposal(ProposalCategory.addCategory, actionData, voters, governance);
    }

    // withdraw assets proposal category
    {
      const parameters = [
        ['string', 'Withdraw depegged asset'], // name
        ['uint256', Role.AdvisoryBoard], // member role that votes
        ['uint256', 60], // majority vote percentage
        ['uint256', 15], // quorum percentage
        ['uint256[]', [Role.AdvisoryBoard]], // allowed to create proposal
        ['uint256', 3 * 24 * 3600], // closing time 3 days
        ['string', ''], // action hash - probably ipfs hash
        ['address', '0x0000000000000000000000000000000000000000'], // contract address: used only if next is "EX"
        ['bytes2', hex('IC')], // contract name
        // "incentives" is [min stake, incentive, ab voting req, special resolution]
        ['uint256[]', [0, 0, 1, 0]],
        ['string', 'withdrawAsset(address,address,uint256)'], // function signature
      ];

      const actionData = web3.eth.abi.encodeParameters(
        parameters.map(p => p[0]),
        parameters.map(p => p[1]),
      );

      await submitGovernanceProposal(ProposalCategory.addCategory, actionData, voters, governance);
    }
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
    await setNextBlockTime(windowStart);
    await twapOracle.update([wethDAIPairAddress]);

    // should be able to swap only during the last period within the window
    const period8Start = windowStart + periodSize * 7;
    await setNextBlockTime(period8Start);

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
    await mcr.updateMCR();

    const block = await web3.eth.getBlock('latest');

    const lastUpdateTime = await mcr.lastUpdateTime();
    const mcrFloor = await mcr.mcrFloor();
    const desiredMCR = await mcr.desiredMCR();
    const storedMCR = await mcr.mcr();
    const currentMCR = await mcr.getMCR();

    console.log({
      desiredMCR: desiredMCR.toString(),
      desiredMCRBefore: desiredMCRBefore.toString(),
      mcrFloorBefore: mcrFloorBefore.toString(),
      mcrFloor: mcrFloor.toString(),
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
    const { mcr, pool } = this;

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

  it('change quotation engine address to sign quotes', async function () {
    const { governance, voters } = this;

    const parameters = [
      ['bytes8', hex('QUOAUTH')], // changeAuthQuoteEngine code
      ['address', quoteAuthAddress], // authQuoteEngine
    ];
    const actionData = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    await submitGovernanceProposal(ProposalCategory.updateOwnerParameters, actionData, voters, governance);
  });

  it('add ybDAI yield token cover', async function () {
    const { incidents, dai } = this;
    ybDAI = await ERC20MintableDetailed.new('yield bearing DAI', 'ybDAI', 18);
    await incidents.addProducts([ybDAIProductId], [ybDAI.address], [dai.address], { from: UserAddress.NXM_AB_MEMBER });
  });

  it('buy ybDAI yield token cover', async function () {
    const { dai } = this;
    const generationTime = await time.latest();
    await time.increase(toBN('1'));
    const ybDAICover = {
      amount: 30000, // 1 dai or eth
      price: '3000000000000000', // 0.003
      priceNXM: '1000000000000000000', // 1 nxm
      expireTime: '2000000000', // year 2033
      generationTime: generationTime.toString(),
      currency: hex('DAI'),
      period: 60,
      contractAddress: ybDAIProductId,
    };
    const coverHolder = UserAddress.NXM_WHALE_1;
    await unlock(DAI_HOLDER);
    await unlock(coverHolder);
    await dai.transfer(coverHolder, '3000000000000000', { from: DAI_HOLDER, gasPrice: 0 });
    await buyCoverWithDai({ ...this, qt: this.quotation, p1: this.pool, cover: ybDAICover, coverHolder });
  });

  it('add ETH yield bearing token', async function () {
    const { incidents, pool } = this;
    const ETH = await pool.ETH();
    ybETH = await ERC20MintableDetailed.new('yield bearing ETH', 'ybETH', 18);
    await incidents.addProducts([ybETHProductId], [ybETH.address], [ETH], { from: UserAddress.NXM_AB_MEMBER });
  });

  it('buy ybETH yield token cover', async function () {
    const generationTime = await time.latest();
    await time.increase(toBN('1'));
    const ybETHCover = {
      amount: 1000, // 1 dai or eth
      price: '3000000000000000', // 0.003
      priceNXM: '1000000000000000000', // 1 nxm
      expireTime: '2000000000', // year 2033
      generationTime: generationTime.toString(),
      currency: hex('ETH'),
      period: 60,
      contractAddress: ybETHProductId,
    };
    const coverHolder = UserAddress.NXM_WHALE_1;
    await unlock(coverHolder);
    await buyCover({ ...this, qt: this.quotation, p1: this.pool, cover: ybETHCover, coverHolder });
  });

  it('open incidents for ybETH and ybDAI', async function () {
    const { governance, voters } = this;

    const incidentTime = await time.latest();
    // add incidents
    {
      const parameters = [
        ['address', ybDAIProductId], // productId
        ['uint256', incidentTime], // incidentDate
        ['uint256', ether('1.1')], // priceBefore
      ];

      const actionData = web3.eth.abi.encodeParameters(
        parameters.map(p => p[0]),
        parameters.map(p => p[1]),
      );

      await submitGovernanceProposal(ProposalCategory.addIncident, actionData, voters, governance);
    }

    {
      const parameters = [
        ['address', ybETHProductId], // productId
        ['uint256', incidentTime], // incidentDate
        ['uint256', ether('1.2')], // priceBefore
      ];

      const actionData = web3.eth.abi.encodeParameters(
        parameters.map(p => p[0]),
        parameters.map(p => p[1]),
      );

      await submitGovernanceProposal(ProposalCategory.addIncident, actionData, voters, governance);
    }
  });

  it('pays the correct amount and reverts on duplicate claim', async function () {

    const { dai, incidents, quotationData } = this;
    const coverHolder = UserAddress.NXM_WHALE_1;
    const coverLength = await quotationData.getCoverLength();

    const ybDAICoverId = coverLength - 2;
    const ybDAIIncidentId = '0';
    const ybDAIPriceBefore = ether('1.1'); // DAI per ybDAI
    const ybDAISumAssured = ether('1').muln(30000);
    const ybDAITokenAmount = ether('1').mul(ether('30000')).div(ybDAIPriceBefore);

    await ybDAI.mint(coverHolder, ybDAITokenAmount);
    await ybDAI.approve(incidents.address, ybDAITokenAmount, { from: coverHolder });

    const daiBalanceBefore = await dai.balanceOf(coverHolder);
    await incidents.redeemPayout(ybDAICoverId, ybDAIIncidentId, ybDAITokenAmount, { from: coverHolder });
    const daiBalanceAfter = await dai.balanceOf(coverHolder);

    const daiDiff = daiBalanceAfter.sub(daiBalanceBefore);
    bnEqual(daiDiff, ybDAISumAssured);

    await expectRevert(
      incidents.redeemPayout(ybDAICoverId, ybDAIIncidentId, ybDAITokenAmount, { from: coverHolder }),
      'TokenController: Cover already has accepted claims',
    );

    const ybETHCoverId = coverLength - 1;
    const ybETHIncidentId = '1';
    const ybETHPriceBefore = ether('1.2'); // ETH per ybETH
    const ybETHSumAssured = ether('1').muln(1000);
    const ybETHTokenAmount = ether('1').mul(ether('1000')).div(ybETHPriceBefore);

    await ybETH.mint(coverHolder, ybETHTokenAmount);
    await ybETH.approve(incidents.address, ybETHTokenAmount, { from: coverHolder });

    const ethBalanceBefore = await web3.eth.getBalance(coverHolder);
    await incidents.redeemPayout(ybETHCoverId, ybETHIncidentId, ybETHTokenAmount, { from: coverHolder, gasPrice: 0 });
    const ethBalanceAfter = await web3.eth.getBalance(coverHolder);

    const ethDiff = toBN(ethBalanceAfter).sub(toBN(ethBalanceBefore));
    bnEqual(ethDiff, ybETHSumAssured);

    await expectRevert(
      incidents.redeemPayout(ybETHCoverId, ybETHIncidentId, ybETHTokenAmount, { from: coverHolder }),
      'TokenController: Cover already has accepted claims',
    );
  });
});
