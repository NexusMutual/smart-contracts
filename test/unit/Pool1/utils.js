const { web3 } = require('@openzeppelin/test-environment');
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;

async function setupContractState(
  { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, mcr, pool1, poolData, tokenData }
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
  const { totalAssetValue, mcrPercentage } = await mcr.calVtpAndMCRtp();
  return {
    a,
    c,
    tokenExponent,
    totalAssetValue,
    mcrPercentage
  };
}

function keysToString (object) {
  const newObject = {};
  for (const key of Object.keys(object)) {
    newObject[key] = object[key].toString();
  }

  return newObject;
}

module.exports = {
  setupContractState,
  keysToString
}
