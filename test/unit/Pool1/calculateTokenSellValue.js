const { ether } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const Decimal = require('decimal.js');
const { assert } = require('chai');
const { BN } = web3.utils;

const maxRelativeError = Decimal(0.0005);

describe('calculateTokenSellValue', function () {
  it('calculates token  price for a change in total assets correctly', async function () {
    const { pool1 } = this;

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const deltaEth = ether('1000');

    const tokenValue = await pool1.calculateTokenBuyValue(
      deltaEth, initialAssetValue, mcrEth,
    );
    const postBuyAssetValue = initialAssetValue.add(deltaEth);

    const sellSpread = Decimal(0.025);

    const ethValue = await pool1.calculateTokenSellValue(
      tokenValue.toString(), postBuyAssetValue.toString(), mcrEth.toString(),
    );

    const expectedEthValue = Decimal(1).sub(sellSpread).mul(Decimal(deltaEth.toString()));
    const ethValueDecimal = Decimal(ethValue.toString());
    const relativeError = expectedEthValue.sub(ethValueDecimal).abs().div(expectedEthValue);

    assert(relativeError.lt(maxRelativeError), `Relative error too high: ${relativeError.toFixed()}`);
  });
});
