const { web3 } = require('@openzeppelin/test-environment');
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;

async function setupContractState(
  { fundSource, initialAssetValue, mcrEth, maxPercentage, daiRate, ethRate, mcr, pool1, token, buyValue, poolData, tokenData }
) {
  const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
  const tokenExponent = await tokenData.tokenExponent();
  const mcrPercentagex100 = initialAssetValue.mul(new BN(10000)).div(mcrEth);

  await pool1.sendTransaction({
    from: fundSource,
    value: initialAssetValue
  });

  await poolData.setAverageRate(hex('ETH'), ethRate);
  await poolData.setAverageRate(hex('DAI'), daiRate);

  const date = new Date().getTime();
  await poolData.setLastMCR(mcrPercentagex100, mcrEth, initialAssetValue, date);
  let { totalAssetValue, mcrPercentage } = await mcr.getTotalAssetValueAndMCRPercentage();
  return {
    a,
    c,
    tokenExponent,
    totalAssetValue,
    mcrPercentage
  };
}



module.exports = {
  setupContractState,
}
