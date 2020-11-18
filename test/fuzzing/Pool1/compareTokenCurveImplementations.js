const { ether } = require('@openzeppelin/test-helpers');
const { web3, artifacts } = require('hardhat');
const { assert } = require('chai');
const { hex } = require('../../unit/utils').helpers;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { accounts } = require('../../unit/utils');
const { setupContractState } = require('../../unit/Pool1/utils');
const { calculatePurchasedTokensWithFullIntegral } = require('../../unit/utils').tokenPrice;

const { Role } = require('../../unit/utils').constants;

const {
  nonMembers: [fundSource],
  members: [member1, member2],
} = accounts;

const MasterMock = artifacts.require('MasterMock');
const PoolData = artifacts.require('Pool1MockPoolData');
const TokenData = artifacts.require('TokenData');
const TokenController = artifacts.require('TokenControllerMock');
const TokenMock = artifacts.require('NXMTokenMock');
const Pool1 = artifacts.require('Pool1');
const MCR = artifacts.require('MCR');
const ERC20Mock = artifacts.require('ERC20Mock');
const TokenFunctions = artifacts.require('TokenFunctions');
const Pool1MockOldMCR = artifacts.require('Pool1MockOldMCR');
const Pool1MockOldPool1 = artifacts.require('Pool1MockOldPool1');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');

async function compareBuyValues (
  { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError,
    daiRate, ethRate, old, current, isLessThanExpectedTokensOut },
) {
  await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, buyValue, ...old, fetchStoredState: false },
  );
  let { totalAssetValue, mcrRatio } = await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, buyValue, ...current },
  );

  let highestRelativeError = 0;
  while (mcrRatio < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrRatio.toString() });
    const preBuyBalanceMember1 = await current.token.balanceOf(member1);
    const tx = await current.pool1.buyNXM('0', {
      from: member1,
      value: buyValue,
    });
    const postBuyBalanceMember1 = await current.token.balanceOf(member1);
    const tokensReceivedMember1 = postBuyBalanceMember1.sub(preBuyBalanceMember1);

    const preBuyBalanceMember2 = await old.token.balanceOf(member2);
    await old.pool1.buyToken({
      from: member2,
      value: buyValue,
    });
    const postBuyBalanceMember2 = await old.token.balanceOf(member2);
    const tokensReceivedMember2 = postBuyBalanceMember2.sub(preBuyBalanceMember2);

    const tokensReceivedMember1Decimal = Decimal(tokensReceivedMember1.toString());
    const tokensReceivedMember2Decimal = Decimal(tokensReceivedMember2.toString());

    const relativeError = tokensReceivedMember2Decimal
      .sub(tokensReceivedMember1Decimal)
      .abs().div(tokensReceivedMember2Decimal);
    highestRelativeError = Math.max(relativeError.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeError.toString(), highestRelativeError: highestRelativeError.toString() });

    if (isLessThanExpectedTokensOut) {
      assert(tokensReceivedMember1Decimal.lt(tokensReceivedMember2Decimal),
        `${tokensReceivedMember2Decimal} is greater than old system value ${tokensReceivedMember2Decimal}`);
    }
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting token value ${tokensReceivedMember1Decimal.toFixed()} is not close enough to old system value ${tokensReceivedMember2Decimal.toFixed()}
       Relative error: ${relativeError}. Difference: ${tokensReceivedMember1Decimal.sub(tokensReceivedMember2Decimal).div(1e18).toFixed()}`,
    );

    if (buyValue.lt(poolBalanceStep)) {
      const extraStepValue = poolBalanceStep.sub(buyValue);
      await current.pool1.sendTransaction({
        from: fundSource,
        value: extraStepValue,
      });

      await old.pool1.sendTransaction({
        from: fundSource,
        value: extraStepValue,
      });
    }
    ({ totalAssetValue, mcrPercentage: mcrRatio } = await current.mcr.calVtpAndMCRtp());
  }
  console.log({
    highestRelativeError: highestRelativeError,
  });
}

async function compareSellValues (
  { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError,
    daiRate, ethRate, old, current, isLessThanExpectedTokensOut },
) {
  await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, buyValue, ...old, fetchStoredState: false },
  );
  let { totalAssetValue, mcrRatio, a, c, tokenExponent } = await setupContractState(
    { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, buyValue, ...current },
  );

  let highestRelativeError = 0;
  while (mcrRatio < maxPercentage * 100) {
    console.log({ totalAssetValue: totalAssetValue.toString(), mcrPercentage: mcrRatio.toString() });
    // simulate buys

    // mint ideal number of tokens
    const { tokens: idealTokensReceived } = calculatePurchasedTokensWithFullIntegral(
      totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
    );
    await current.pool1.sendTransaction({
      from: fundSource,
      value: buyValue,
    });
    await old.pool1.sendTransaction({
      from: fundSource,
      value: buyValue,
    });

    const tokensReceived = new BN(idealTokensReceived.toFixed());
    await current.token.mint(member1, tokensReceived);
    await old.token.mint(member2, tokensReceived);

    const date = new Date().getTime();
    const vFull = new BN(await web3.eth.getBalance(old.pool1.address));
    const mcrPercentage = vFull.mul(new BN(1e4)).div(mcrEth);
    await old.poolData.setLastMCR(mcrPercentage, mcrEth, vFull, date);

    // the old system has a stricter limitation on how many tokens one can sell
    const getCurrencyAssetBaseMin = await old.poolData.getCurrencyAssetBaseMin(hex('ETH'));
    const getLastMCRPerc = await old.poolData.getLastMCRPerc();
    const maxSellTokens = await old.mcr.getMaxSellTokens();
    const tokensToSell = BN.min(maxSellTokens, tokensReceived);

    console.log({
      maxSellTokens: maxSellTokens.div(new BN(1e18.toString())).toString(),
      tokensReceived: tokensReceived.div(new BN(1e18.toString())).toString(),
      tokensToSell: tokensToSell.div(new BN(1e18.toString())).toString(),
      getCurrencyAssetBaseMin: getCurrencyAssetBaseMin.toString(),
      getLastMCRPerc: getLastMCRPerc.toString(),
    });

    // eslint-disable-next-line
    async function sell (system, member, sellFunction) {
      const balancePreSell = await web3.eth.getBalance(member);
      await system.token.approve(system.tokenController.address, tokensToSell, {
        from: member,
      });
      const sellTx = await sellFunction();
      const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
      const ethSpentOnGas = Decimal(sellTx.receipt.gasUsed).mul(Decimal(gasPrice));
      const balancePostSell = await web3.eth.getBalance(member);
      const sellEthReceived = Decimal(balancePostSell).sub(Decimal(balancePreSell)).add(ethSpentOnGas);
      return sellEthReceived;
    }

    const sellEthReceived = await sell(current, member1, () => current.pool1.sellNXM(tokensToSell, '0', {
      from: member1,
    }));
    const expectedSellEthReceived = await sell(old, member2, () => old.pool1.sellNXMTokens(tokensToSell, {
      from: member2,
    }));

    const relativeError = sellEthReceived
      .sub(expectedSellEthReceived)
      .abs().div(expectedSellEthReceived);
    highestRelativeError = Math.max(relativeError.toNumber(), highestRelativeError);
    console.log({ relativeError: relativeError.toString(), highestRelativeError: highestRelativeError.toString() });

    if (isLessThanExpectedTokensOut) {
      assert(sellEthReceived.lte(expectedSellEthReceived),
        `${sellEthReceived} is greater than old system value ${expectedSellEthReceived}`);
    }
    assert(
      relativeError.lt(maxRelativeError),
      `Resulting eth value ${sellEthReceived.toFixed()} is not close enough to old system value ${expectedSellEthReceived.toFixed()}
       Relative error: ${relativeError}. Difference: ${sellEthReceived.sub(expectedSellEthReceived).div(1e18).toFixed()}`,
    );

    if (buyValue.lt(poolBalanceStep)) {
      const extraStepValueForCurrent = poolBalanceStep.sub(buyValue).add(new BN(sellEthReceived.toFixed()));
      await current.pool1.sendTransaction({
        from: fundSource,
        value: extraStepValueForCurrent,
      });

      const extraStepValueForOld = poolBalanceStep.sub(buyValue).add(new BN(expectedSellEthReceived.toFixed()));
      await old.pool1.sendTransaction({
        from: fundSource,
        value: extraStepValueForOld,
      });
    }
    ({ totalAssetValue, mcrPercentage: mcrRatio } = await current.mcr.calVtpAndMCRtp());
  }
  console.log({
    highestRelativeError: highestRelativeError,
  });
}

async function setup ({ MCR, Pool1 }) {

  const master = await MasterMock.new();

  const daiFeedAddress = '0x0000000000000000000000000000000000000001';
  const mockP2Address = '0x0000000000000000000000000000000000000012';
  const dai = await ERC20Mock.new();

  const chainlinkAggregators = {};
  chainlinkAggregators['DAI'] = await ChainlinkAggregatorMock.new();
  const priceFeedOracle = await PriceFeedOracle.new([dai.address], [chainlinkAggregators['DAI'].address], dai.address);

  const poolData = await PoolData.new(accounts.notariseAddress, daiFeedAddress, dai.address);
  const tokenData = await TokenData.new(accounts.notariseAddress);
  const pool1 = await Pool1.new(priceFeedOracle.address);
  const token = await TokenMock.new();
  const mcr = await MCR.new();
  const tokenController = await TokenController.new();
  const tokenFunctions = await TokenFunctions.new();
  await token.mint(accounts.defaultSender, ether('10000'));

  // set contract addresses
  await master.setTokenAddress(token.address);
  await master.setLatestAddress(hex('P1'), pool1.address);
  await master.setLatestAddress(hex('PD'), poolData.address);
  await master.setLatestAddress(hex('TD'), tokenData.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('P2'), mockP2Address);
  await master.setLatestAddress(hex('TF'), tokenFunctions.address);

  const contractsToUpdate = [pool1, tokenController, tokenFunctions, mcr];
  for (const contract of contractsToUpdate) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
  }

  // required to be able to mint
  await master.enrollInternal(pool1.address);

  for (const member of accounts.members) {
    await master.enrollMember(member, Role.Member);
  }

  for (const advisoryBoardMember of accounts.advisoryBoardMembers) {
    await master.enrollMember(advisoryBoardMember, Role.AdvisoryBoard);
  }

  for (const internalContract of accounts.internalContracts) {
    await master.enrollInternal(internalContract);
  }

  // there is only one in reality, but it doesn't matter
  for (const governanceContract of accounts.governanceContracts) {
    await master.enrollGovernance(governanceContract);
  }

  // initialize token
  await token.setOperator(tokenController.address);

  return {
    master,
    token,
    pool1,
    mcr,
    poolData,
    tokenData,
    tokenController,
    chainlinkAggregators,
  };
}

async function setupBothImplementations () {
  this.current = await setup({ MCR, Pool1 });
  this.old = await setup({ MCR: Pool1MockOldMCR, Pool1: Pool1MockOldPool1 });
}

describe('compareTokenCurveImplementations', function () {

  const daiRate = new BN('39459');
  const ethRate = new BN('100');
  const maxPercentage = 400;

  before(setupBothImplementations);

  it('mints similar number of tokens with current buyNXM call as the old sellNXMTokens for buyValue 0.01 ETH', async function () {
    const { old, current } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('0.01');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.0001);
    await compareBuyValues(
      { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError, daiRate, ethRate, old, current },
    );
  });

  it('mints similar number of tokens with current buyNXM call as the old buyToken for buyValue 10 ETH', async function () {
    const { old, current } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('100');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.002);
    await compareBuyValues(
      { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError, daiRate, ethRate, old, current },
    );
  });

  it('mints similar number of tokens with current buyNXM call as the old buyToken for buyValue 1000 ETH', async function () {
    const { old, current } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');
    const poolBalanceStep = mcrEth.div(new BN(2));

    // relative errors increases compared to old system, as purchase amount increases.
    // Token steps computation has a high error rate as MCR% increases
    const maxRelativeError = Decimal(0.01);
    await compareBuyValues(
      { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError, isLessThanExpectedTokensOut: true, daiRate, ethRate, old, current },
    );
  });

  it('mints similar number of tokens with current buyNXM call as the old buyToken for buyValue 10000 ETH', async function () {
    const { old, current } = this;

    const mcrEth = ether('320000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('10000');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.017);
    await compareBuyValues(
      { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError, isLessThanExpectedTokensOut: true, daiRate, ethRate, old, current },
    );
  });

  it('returns similar ETH value with current sellNXM call as the old sellNXMTokens for maxSellTokensAmount (old) for MCReth=160k for sells of size 2.5%', async function () {
    const { old, current } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(40)); // 2.5% of MCReth max sells
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.017);
    await compareSellValues(
      { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError, isLessThanExpectedTokensOut: true, daiRate, ethRate, old, current },
    );
  });

  it('returns similar ETH value with current sellNXM call as the old sellNXMTokens for maxSellTokensAmount (old) for MCReth=160k for sells of 0.01ETH', async function () {
    const { old, current } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('0.01');
    const poolBalanceStep = mcrEth.div(new BN(2));
    const maxRelativeError = Decimal(0.017);
    await compareSellValues(
      { initialAssetValue, mcrEth, maxPercentage, poolBalanceStep, buyValue, maxRelativeError, isLessThanExpectedTokensOut: true, daiRate, ethRate, old, current },
    );
  });
});
