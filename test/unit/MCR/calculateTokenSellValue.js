const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const Decimal = require('decimal.js');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;
const { calculatePurchasedTokensWithFullIntegral, calculateSellValue } = require('../utils').tokenPrice;
const { BN } = web3.utils;

const maxRelativeError = Decimal(0.0001);

describe('calculateTokenSellValue', function () {
  it.only('calculates token  price for a change in total assets correctly', async function () {
    const { mcr } = this;

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const deltaEth = ether('1000');

    const tokenValue = await mcr.calculateTokenBuyValue(
      deltaEth, initialAssetValue, mcrEth
    );
    const postBuyAssetValue = initialAssetValue.add(deltaEth);

    const sellSpread = Decimal(0.025);
    const { ethEstimate: expectedEthSellValue } = calculateSellValue(postBuyAssetValue, mcrEth, tokenValue, sellSpread);

    const { ethValue, mcrPercentage0, spotPrice0, averagePriceWithSpread,
      spotEthAmount, mcrPercentagePostSpotPriceSell, finalPrice, spotPrice1 }
        = await mcr.calculateTokenSellValue(
            tokenValue.toString(), postBuyAssetValue.toString(), mcrEth.toString()
    );

    const expectedEthValue = Decimal(1).sub(sellSpread).mul(Decimal(deltaEth.toString()));
    const ethValueDecimal = Decimal(ethValue.toString());
    assert(ethValueDecimal.lt(expectedEthValue), `The spread is lower than ${sellSpread}`);
    const relativeError = expectedEthValue.sub(Decimal(ethValue.toString())).div(expectedEthValue);

    assert(relativeError.lt(maxRelativeError), `Relative error too high: ${relativeError.toFixed()}`);

    console.log({
      ethValue: ethValue.toString(),
      mcrPercentage0: mcrPercentage0.toString(),
      tokenValue: tokenValue.toString(),
      postBuyAssetValue: postBuyAssetValue.toString(),
      expected: postBuyAssetValue.muln(1e4).div(mcrEth).toString(),
      spotEthAmount: spotEthAmount.toString(),
      mcrPercentagePostSpotPriceSell: mcrPercentagePostSpotPriceSell.toString(),
      finalPrice: finalPrice.toString(),
      spotPrice0: spotPrice0.toString(),
      averagePriceWithSpread: averagePriceWithSpread.toString(),
      spotPrice1: spotPrice1.toString(),
      expectedEthSellValue: expectedEthSellValue.toString(),
      relativeError: relativeError.toString()
      // spotPrice0: spotPrice0.toString(),
      // spotPrice0WithSpread: spotPrice0WithSpread.toString(),
      // spotEthAmount: spotEthAmount.toString()
    });
  });
});
