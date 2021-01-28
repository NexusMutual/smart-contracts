const { assert } = require('chai');
const { contracts } = require('./setup');

describe('pairFor', function () {

  it('should return the correct addresses', async function () {

    const { oracle } = contracts();

    // mainnet addresses
    const wethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
    const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const expectedUsdcEthAddress = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';

    const usdcEth = await oracle.pairFor(wethAddress, usdcAddress);
    assert.strictEqual(usdcEth, expectedUsdcEthAddress, 'weth-usdc pair address mistmatch');

    const usdcEthReversed = await oracle.pairFor(usdcAddress, wethAddress);
    assert.strictEqual(usdcEthReversed, expectedUsdcEthAddress, 'weth-usdc pair address mistmatch');
  });

});
