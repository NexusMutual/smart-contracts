const { web3 } = require('hardhat');
const { hex } = require('../utils').helpers;
const { BN } = web3.utils;

async function setupContractState (
  { fundSource, initialAssetValue, mcrEth, daiRate, ethRate, pool1, poolData, tokenData, fetchStoredState = true },
) {
  const { _a: a, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
  const tokenExponent = await tokenData.tokenExponent();

  const MCR_RATIO_DECIMALS = 4;
  const mcrRatio = initialAssetValue.mul(new BN(10 ** MCR_RATIO_DECIMALS)).div(mcrEth);

  await pool1.sendTransaction({
    from: fundSource,
    value: initialAssetValue,
  });

  await poolData.setAverageRate(hex('ETH'), ethRate);
  await poolData.setAverageRate(hex('DAI'), daiRate);

  const date = new Date().getTime();
  await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);


  const stateValues = {
    a,
    c,
    tokenExponent,
  };
  if (fetchStoredState) {
    const totalAssetValue = await pool1.getPoolValueInEth();
    const storedMCRRatio = await pool1.getMCRRatio();
    stateValues.totalAssetValue = totalAssetValue;
    stateValues.mcrRatio = storedMCRRatio;
  }
  return stateValues;
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
  keysToString,
};
