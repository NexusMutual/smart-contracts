const { web3 } = require('hardhat');
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;
const Decimal = require('decimal.js');
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens, sellSpread } = require('../utils').tokenPrice;

async function setupContractState ({
  fundSource,
  initialAssetValue,
  mcrEth,
  daiRate,
  ethRate,
  pool,
  poolData,
  tokenData,
  chainlinkDAI,
  fetchStoredState = true,
}) {

  const a = new BN('5800000');
  const c = new BN('1028' + '0'.repeat(13)); // 1028 * 1e13
  const tokenExponent = await tokenData.tokenExponent();

  const MCR_RATIO_DECIMALS = 4;
  const mcrRatio = initialAssetValue.mul(new BN(10 ** MCR_RATIO_DECIMALS)).div(mcrEth);

  await pool.sendTransaction({
    from: fundSource,
    value: initialAssetValue,
  });

  await poolData.setAverageRate(hex('ETH'), ethRate);
  await poolData.setAverageRate(hex('DAI'), daiRate);

  const ethToDaiRate = daiRate.mul(new BN(1e16.toString())); // adjusted to 18 decimals
  const daiToEthRate = new BN(10).pow(new BN(36)).div(ethToDaiRate);
  await chainlinkDAI.setLatestAnswer(daiToEthRate);

  await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());

  const stateValues = { a, c, tokenExponent };

  if (fetchStoredState) {
    const totalAssetValue = await pool.getPoolValueInEth();
    const storedMCRRatio = await pool.getMCRRatio();
    stateValues.totalAssetValue = totalAssetValue;
    stateValues.mcrRatio = storedMCRRatio;
  }

  return stateValues;
}

async function assertBuy ({ member, totalAssetValue, mcrEth, buyValue, c, a, tokenExponent, maxRelativeError, pool, token }) {
  const preEstimatedTokenBuyValue = await pool.getNXMForEth(buyValue);

  const preBuyBalance = await token.balanceOf(member);

  await pool.buyNXM(preEstimatedTokenBuyValue, {
    from: member,
    value: buyValue,
  });
  const postBuyBalance = await token.balanceOf(member);
  const tokensReceived = postBuyBalance.sub(preBuyBalance);

  const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
    totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
  );

  const { tokens: expectedTokenValue } = calculatePurchasedTokens(
    totalAssetValue, buyValue, mcrEth, c, a.mul(new BN(1e13.toString())), tokenExponent,
  );

  assert(
    new BN(expectedTokenValue.toString()).sub(tokensReceived).lte(new BN(1)),
    `expectedPrice ${expectedTokenValue.toString()} - price ${tokensReceived.toString()} > 1 wei`,
  );

  const tokensReceivedDecimal = Decimal(tokensReceived.toString());
  const relativeError = expectedIdealTokenValue.sub(tokensReceivedDecimal).abs().div(expectedIdealTokenValue);
  console.log({ relativeError: relativeError.toString() });
  assert(
    relativeError.lt(maxRelativeError),
    `Resulting token value ${tokensReceivedDecimal.toFixed()} is not close enough to expected ${expectedIdealTokenValue.toFixed()}
       Relative error: ${relativeError}`,
  );
  return tokensReceived;
}

async function assertSell (
  { member, tokensToSell, buyValue, maxRelativeError, pool, tokenController, token, isLessThanExpectedEthOut },
) {
  const precomputedEthValue = await pool.getEthForNXM(tokensToSell);
  console.log({
    precomputedEthValue: precomputedEthValue.toString(),
    tokensReceived: tokensToSell.toString(),
  });

  await token.approve(tokenController.address, tokensToSell, {
    from: member,
  });
  const balancePreSell = await web3.eth.getBalance(member);
  const nxmBalancePreSell = await token.balanceOf(member);
  const sellTx = await pool.sellNXM(tokensToSell, precomputedEthValue, {
    from: member,
  });
  const nxmBalancePostSell = await token.balanceOf(member);

  const nxmBalanceDecrease = nxmBalancePreSell.sub(nxmBalancePostSell);
  assert(nxmBalanceDecrease.toString(), tokensToSell.toString());

  const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
  const ethSpentOnGas = Decimal(sellTx.receipt.gasUsed).mul(Decimal(gasPrice));

  const balancePostSell = await web3.eth.getBalance(member);
  const sellEthReceived = Decimal(balancePostSell).sub(Decimal(balancePreSell)).add(ethSpentOnGas);

  const expectedEthOut = Decimal(buyValue.toString()).mul(Decimal(1).sub(sellSpread));

  const relativeErrorForSell = expectedEthOut.sub(sellEthReceived).abs().div(expectedEthOut);
  console.log({ relativeError: relativeErrorForSell.toString() });
  if (isLessThanExpectedEthOut) {
    assert(sellEthReceived.lt(expectedEthOut), `${sellEthReceived.toFixed()} is greater than ${expectedEthOut.toFixed()}`);
  }
  assert(
    relativeErrorForSell.lt(maxRelativeError),
    `Resulting eth value ${sellEthReceived.toFixed()} is not close enough to expected ${expectedEthOut.toFixed()}
       Relative error: ${relativeErrorForSell}`,
  );
}

module.exports = {
  setupContractState,
  assertBuy,
  assertSell,
};
