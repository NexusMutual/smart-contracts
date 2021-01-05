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
const TemporaryNXMaster = artifacts.require('TemporaryNXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const PoolData = artifacts.require('PoolData');
const TokenFunctions = artifacts.require('TokenFunctions');
const Claims = artifacts.require('Claims');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const Pool2 = artifacts.require('Pool2');
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

describe.only('NXM sells and buys', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const masterAddress = getAddressByCode('NXMASTER');
    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const governance = await Governance.at(getAddressByCode('GV'));
    const poolData = await PoolData.at(getAddressByCode('PD'));
    const oldMCR = await LegacyMCR.at(getAddressByCode('MC'));

    this.masterAddress = masterAddress;
    this.token = token;
    this.memberRoles = memberRoles;
    this.governance = governance;
    this.poolData = poolData;
    this.oldMCR = oldMCR;
    this.getAddressByCode = getAddressByCode;
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

  it('upgrade master and rescue sai', async function () {

    const { masterAddress, governance, voters, getAddressByCode } = this;
    const masterProxy = await OwnedUpgradeabilityProxy.at(masterAddress);

    const parameters = [
      ['string', 'Upgrade master'], // name
      ['uint256', Role.AdvisoryBoard], // member role that votes
      ['uint256', 60], // majority vote percentage
      ['uint256', 15], // quorum percentage
      ['uint256[]', [Role.AdvisoryBoard]], // allowed to create proposal
      ['uint256', 3 * 24 * 3600], // closing time 3 days
      ['string', ''], // action hash - probably ipfs hash
      ['address', '0x0000000000000000000000000000000000000000'], // contract address: used only if next is "EX"
      ['bytes2', hex('MS')], // contract name
      // "incentives" is [min stake, incentive, ab voting req, special resolution]
      ['uint256[]', [0, 0, 1, 0]],
      ['string', 'upgradeTo(address)'], // function signature
    ];

    const addCategory = web3.eth.abi.encodeParameters(
      parameters.map(p => p[0]),
      parameters.map(p => p[1]),
    );

    // add new category for master upgrade
    await submitGovernanceProposal(ProposalCategory.addCategory, addCategory, voters, governance);

    const dst = '0x0000000000000000000000000000000000001337';
    const sai = await ERC20.at(Address.SAI);
    const wnxm = await ERC20.at(Address.WNXM);
    const p1 = getAddressByCode('P1');
    const tc = getAddressByCode('TC');

    const saiStuck = await sai.balanceOf(p1);
    const wnxmStuck = await wnxm.balanceOf(tc);

    // upgrade master to TemporaryNXMaster to rescue sai
    const masterImplementation = await TemporaryNXMaster.new();
    const upgradeMaster = web3.eth.abi.encodeParameters(['address'], [masterImplementation.address]);
    await submitGovernanceProposal(ProposalCategory.upgradeMaster, upgradeMaster, voters, governance);

    const actualMasterImplementation = await masterProxy.implementation();
    assert.strictEqual(actualMasterImplementation, masterImplementation.address);

    const temporaryMaster = await TemporaryNXMaster.at(masterAddress);
    const tcProxyAddress = await temporaryMaster.getLatestAddress(hex('TC'));
    const tcProxy = await OwnedUpgradeabilityProxy.at(tcProxyAddress);
    const preRescueTCImpl = await tcProxy.implementation();

    // perform the rescue operation
    await temporaryMaster.rescueTokens();

    // make sure TC implementation was succesfully restored
    const postRescueTCImpl = await tcProxy.implementation();
    assert.strictEqual(postRescueTCImpl, preRescueTCImpl);

    const saiLeft = await sai.balanceOf(p1);
    const saiSent = await sai.balanceOf(dst);

    assert.strictEqual(saiLeft.toString(), '0', 'SAI still in P1!');
    assert.strictEqual(saiStuck.toString(), saiSent.toString(), 'SAI not in DST!');

    const wnxmLeft = await wnxm.balanceOf(tc);
    const wnxmSent = await wnxm.balanceOf(dst);
    assert.strictEqual(wnxmLeft.toString(), '0', 'wNXM still in TC!');
    assert.strictEqual(wnxmStuck.toString(), wnxmSent.toString(), 'wNXM not in DST!');

    this.master = temporaryMaster;
  });

  it('performs contract upgrades', async function () {

    const { master, governance, voters, poolData, oldMCR, getAddressByCode } = this;

    const oldPool1Address = getAddressByCode('P1');
    const oldPool2Address = getAddressByCode('P2');
    const dai = await ERC20.at(Address.DAI);

    const { vtp: poolValueBefore } = await oldMCR.calVtpAndMCRtp();

    const p1EthBefore = await web3.eth.getBalance(oldPool1Address);
    const p2EthBefore = await web3.eth.getBalance(oldPool2Address);
    const p1DaiBefore = await dai.balanceOf(oldPool1Address);
    const p2DaiBefore = await dai.balanceOf(oldPool2Address);

    const tokenSpotPriceEthBefore = await oldMCR.calculateTokenPrice(hex('ETH'));
    const tokenSpotPriceDaiBefore = await oldMCR.calculateTokenPrice(hex('DAI'));

    /* MCR data */
    const previousVariableMincap = await oldMCR.variableMincap();
    const previousDynamicMincapThresholdx100 = await oldMCR.dynamicMincapThresholdx100();
    const previousDynamicMincapIncrementx100 = await oldMCR.dynamicMincapIncrementx100();
    const previousAllSumAssurance = await oldMCR.getAllSumAssurance();

    console.log('Deploying contracts');

    const newTF = await TokenFunctions.new();
    const newCL = await Claims.new();
    const newMCR = await MCR.new(master.address);
    const newClaimsReward = await ClaimsReward.new(master.address, Address.DAI);
    const newQuotation = await Quotation.new();
    const newPool2 = await Pool2.new(master.address, Address.DAI);

    const priceFeedOracle = await PriceFeedOracle.new([Address.DAI], [Address.DAIFEED], Address.DAI);
    const twapOracle = await TwapOracle.new(Address.UNIFACTORY);
    Pool.link(await SwapAgent.new());

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
        ['TF', 'CL', 'MC', 'QT', 'CR', 'P1', 'P2'].map(hex),
        [newTF, newCL, newMCR, newQuotation, newClaimsReward, pool, newPool2].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      actionData,
      voters,
      governance,
    );

    const storedTFAddress = await master.getLatestAddress(hex('TF'));
    const storedCLAddress = await master.getLatestAddress(hex('CL'));
    const storedMCRAddress = await master.getLatestAddress(hex('MC'));
    const storedCRAddress = await master.getLatestAddress(hex('CR'));
    const storedQTAddress = await master.getLatestAddress(hex('QT'));
    const storedP1Address = await master.getLatestAddress(hex('P1'));
    const storedP2Address = await master.getLatestAddress(hex('P2'));

    assert.equal(storedTFAddress, newTF.address);
    assert.equal(storedCLAddress, newCL.address);
    assert.equal(storedCRAddress, newClaimsReward.address);
    assert.equal(storedQTAddress, newQuotation.address);
    assert.equal(storedMCRAddress, newMCR.address);
    assert.equal(storedP1Address, pool.address);
    assert.equal(storedP2Address, newPool2.address);

    console.log('Successfully upgraded');

    /* MCR parameters */

    const variableMincap = await newMCR.variableMincap();
    const dynamicMincapThresholdx100 = await newMCR.dynamicMincapThresholdx100();
    const dynamicMincapIncrementx100 = await newMCR.dynamicMincapIncrementx100();
    const allSumAssurance = await newMCR.getAllSumAssurance();

    assert.equal(variableMincap.toString(), previousVariableMincap.toString());
    assert.equal(dynamicMincapThresholdx100.toString(), previousDynamicMincapThresholdx100.toString());
    assert.equal(dynamicMincapIncrementx100.toString(), previousDynamicMincapIncrementx100.toString());
    // new getTotalSumAssurance returns wei instead of units
    assert.equal(allSumAssurance.div(toBN(1e18.toString())).toString(), previousAllSumAssurance.toString());

    /* Check old pools' balances */
    const oldPool1EthBalanceAfter = await web3.eth.getBalance(oldPool1Address);
    const oldPool1DaiBalanceAfter = await dai.balanceOf(oldPool1Address);
    assert.equal(oldPool1EthBalanceAfter.toString(), '0');
    assert.equal(oldPool1DaiBalanceAfter.toString(), '0');

    const oldPool2EthBalanceAfter = await web3.eth.getBalance(oldPool2Address);
    const oldPool2DaiBalanceAfter = await dai.balanceOf(oldPool2Address);
    assert.equal(oldPool2EthBalanceAfter.toString(), '0');
    assert.equal(oldPool2DaiBalanceAfter.toString(), '0');

    const poolEthAfter = await web3.eth.getBalance(pool.address);
    const poolDaiAfter = await dai.balanceOf(pool.address);

    const expectedEth = toBN(p1EthBefore).add(toBN(p2EthBefore));
    const expectedDai = p1DaiBefore.add(p2DaiBefore);

    assert.equal(poolEthAfter, expectedEth.toString());
    assert.equal(poolDaiAfter.toString(), expectedDai.toString());

    /* Token spot price checks */
    const tokenSpotPriceEthAfter = await pool.getTokenPrice(Address.ETH);
    const tokenSpotPriceDaiAfter = await pool.getTokenPrice(Address.DAI);

    const { rate } = await poolData.getTokenPriceDetails(hex('DAI'));

    const priceFeedRate = await priceFeedOracle.getAssetToEthRate(Address.DAI);
    const poolValueAfter = await pool.getPoolValueInEth();

    console.log({
      getCAAvgRate: rate.toString(),
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
  });

  it('upgrade temporary master ', async function () {

    const { governance, voters, masterAddress } = this;
    const masterProxy = await OwnedUpgradeabilityProxy.at(masterAddress);

    // upgrade to new master
    const masterImplementation = await NXMaster.new();

    // vote and upgrade
    const upgradeMaster = web3.eth.abi.encodeParameters(['address'], [masterImplementation.address]);
    await submitGovernanceProposal(ProposalCategory.upgradeMaster, upgradeMaster, voters, governance);

    // check implementation
    const actualMasterImplementation = await masterProxy.implementation();
    assert.strictEqual(actualMasterImplementation, masterImplementation.address);
  });

  it('performs buys and sells', async function () {

    const { poolData, pool, token } = this;

    const mcrEth = await poolData.getLastMCREther();
    const maxBuy = percentageBN(mcrEth, 4.95);

    const balancePre = await token.balanceOf(Address.NXMHOLDER);
    await pool.buyNXM('0', { value: maxBuy, from: Address.NXMHOLDER });
    const balancePost = await token.balanceOf(Address.NXMHOLDER);
    const nxmOut = balancePost.sub(balancePre);

    const balancePreSell = await web3.eth.getBalance(Address.NXMHOLDER);
    const sellTx = await pool.sellNXM(nxmOut, '0', { from: Address.NXMHOLDER });

    const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
    const ethSpentOnGas = Decimal(sellTx.receipt.gasUsed).mul(Decimal(gasPrice));
    const balancePostSell = await web3.eth.getBalance(Address.NXMHOLDER);
    const ethOut = toDecimal(balancePostSell).sub(toDecimal(balancePreSell)).add(ethSpentOnGas);
    const ethInDecimal = toDecimal(maxBuy);

    assert(ethOut.lt(ethInDecimal), 'ethOut > ethIn');

    console.log({
      ethOut: toDecimal(ethOut).div(1e18).toString(),
      ethIn: ethInDecimal.div(1e18).toString(),
    });

    const { relativeError: sellSpreadRelativeError } = calculateEthForNXMRelativeError(ethInDecimal, ethOut);

    assert(
      sellSpreadRelativeError.lt(Decimal(0.08)),
      `sell value too low ${ethOut.toFixed()}. sellSpreadRelativeError = ${sellSpreadRelativeError.toFixed()}`,
    );
  });

  it('sells down to 100% MCR%', async function () {

    const { pool } = this;
    const tokensToSell = ether('10000');

    let mcrRatio = await pool.getMCRRatio();

    while (mcrRatio.gt('100')) {

      const expectedEthOut = await pool.getEthForNXM(tokensToSell);

      try {
        await pool.sellNXM(tokensToSell, '0', {
          from: Address.NXMHOLDER,
        });
      } catch (e) {
        assert(mcrRatio.lt(new BN(10050)), `MCR ratio not as low as expected. current value: ${mcrRatio.toString()}`);
        break;
      }

      mcrRatio = await pool.getMCRRatio();
      console.log({
        tokensToSell: tokensToSell.toString(),
        expectedEthOut: toDecimal(expectedEthOut).div(1e18).toString(),
        mcrRatio: mcrRatio.toString(),
      });
    }

    await expectRevert(
      pool.sellNXM(tokensToSell, '0', { from: Address.NXMHOLDER }),
      'MCR% cannot fall below 100%',
    );
  });

  it('buys up to 400% MCR%', async function () {

    const { pool, poolData, priceFeedOracle } = this;

    let mcrRatio = await pool.getMCRRatio();
    let totalBuyValue = new BN('0');

    while (mcrRatio.lt(new BN('40000'))) {

      const mcrEth = await poolData.getLastMCREther();
      const maxBuy = percentageBN(mcrEth, 4.95);

      await pool.buyNXM('0', { value: maxBuy, from: Address.NXMHOLDER });

      mcrRatio = await pool.getMCRRatio();
      const daiAddress = await priceFeedOracle.daiAddress();
      const tokenSpotPriceDai = await pool.getTokenPrice(daiAddress);

      totalBuyValue = totalBuyValue.add(maxBuy);
      console.log({
        maxBuy: maxBuy.div(ether('1')).toString(),
        totalBuyValue: totalBuyValue.div(ether('1')).toString(),
        mcrRatio: mcrRatio.toString(),
        tokenSpotPriceDai: tokenSpotPriceDai.div(ether('1')).toString(),
      });
    }

    const mcrEth = await poolData.getLastMCREther();
    const maxBuy = percentageBN(mcrEth, 4.95);

    await expectRevert(
      pool.buyNXM('0', { from: Address.NXMHOLDER, value: maxBuy }),
      'Pool: Cannot purchase if MCR% > 400%',
    );
  });

  it('peforms hypothetical future Pool upgrade', async function () {

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
        ['TF', 'CL', 'MC', 'QT', 'CR', 'P1', 'P2'].map(hex),
        [newTF, newCL, newMCR, newQuotation, newClaimsReward, pool, newPool2].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      actionData,
      voters,
      governance,
    );

  });
});
