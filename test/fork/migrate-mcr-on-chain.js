const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');

const { submitGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, Role } = require('../utils').constants;

const {
  toDecimal,
  calculateRelativeError,
  percentageBN,
  calculateEthForNXMRelativeError,
} = require('../utils').tokenPrice;

const { BN, toBN } = web3.utils;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const Pool = artifacts.require('Pool');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Claims = artifacts.require('Claims');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const Pool2 = artifacts.require('Pool2');
const LegacyPool1 = artifacts.require('LegacyPool1');
const LegacyMCR = artifacts.require('LegacyMCR');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ERC20 = artifacts.require('ERC20');
const SwapAgent = artifacts.require('SwapAgent');
const TwapOracle = artifacts.require('TwapOracle');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  SAI: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
  WNXM: '0x0d438F3b5175Bebc262bF23753C1E53d03432bDE',
  DAIFEED: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  UNIFACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

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

describe.only('MCR on-chain migration', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const masterAddress = getAddressByCode('NXMASTER');
    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const governance = await Governance.at(getAddressByCode('GV'));
    const pool1 = await Pool.at(getAddressByCode('P1'));
    const oldMCR = await LegacyMCR.at(getAddressByCode('MC'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.oldPool = pool1;
    this.oldMCR = oldMCR;
    this.getAddressByCode = getAddressByCode;
    this.master = await NXMaster.at(masterAddress);
  });

  it('fetches board members and funds accounts', async function () {

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(0, 3);

    for (const member of [...voters, Address.NXMHOLDER]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
  });

  it('upgrade contracts', async function () {

    const { governance, voters, oldMCR, getAddressByCode, oldPool, master } = this;

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

    console.log('Deploying contracts');

    /*
    Upgrade list:
    contracts/modules/capital/MCR.sol
    contracts/modules/capital/Pool.sol
    contracts/modules/claims/ClaimsReward.sol
    contracts/modules/cover/Quotation.sol
    */

    const newMCR = await MCR.new(master.address);
    const newClaimsReward = await ClaimsReward.new(master.address, Address.DAI);
    const newQuotation = await Quotation.new();

    console.log('Fetc price feed oracle');
    const priceFeedOracle = await PriceFeedOracle.at(await oldPool.priceFeedOracle());

    console.log('Fetch twap oracle');
    const twapOracle = { address: await oldPool.twapOracle() };

    console.log('Link pool to swap agent');
    Pool.link(await SwapAgent.new());

    console.log('Deploy pool');
    const pool = await Pool.new(
      [Address.DAI],
      [0],
      [ether('10000000')],
      [ether('0.01')],
      master.address,
      priceFeedOracle.address,
      twapOracle.address,
      voters[0],
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
    const dynamicMincapThresholdx100 = await newMCR.mcrFloorIncrementThreshold();
    const maxMCRFloorIncrement = await newMCR.maxMCRFloorIncrement();
    const allSumAssurance = await newMCR.getAllSumAssurance();

    assert.equal(mcrFloor.toString(), previousVariableMincap.toString());
    assert.equal(dynamicMincapThresholdx100.toString(), previousDynamicMincapThresholdx100.toString());
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

    console.log({
      priceFeedRate: priceFeedRate.toString(),
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

    this.priceFeedOracle = priceFeedOracle;
    this.pool = pool;
    this.twapOracle = twapOracle;
    this.dai = dai;
  });
});
