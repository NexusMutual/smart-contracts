const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;
const { calculatePurchasedTokensWithFullIntegral, calculatePurchasedTokens } = require('../utils').tokenPrice;
const BN = web3.utils.BN;

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  governanceContracts: [governanceContract],
  internalContracts: [internalContract],
} = accounts;


describe.only('calculateTokenPriceForDeltaEth', function () {
  it('calculates token  price for a change in total assets correctly', async function () {
    const { mcr, poolData, tokenData } = this;

    const { _a: rawA, _c: c } = await poolData.getTokenPriceDetails(hex('ETH'));
    const tokenExponent = await tokenData.tokenExponent();
    const a = rawA.mul(new BN(1e13.toString()));

    const mcrEth = new BN('162424730681679380000000');
    const initialAssetValue = new BN('210959924071154460525457');
    const deltaEth = new BN('1000').mul(new BN(1e18.toString()));
    const nextAssetValue = initialAssetValue.add(deltaEth);


    const adjustedTokenAmount = await mcr.calculateAdjustedTokenAmount(
      initialAssetValue,
      nextAssetValue,
      mcrEth,
      c,
      tokenExponent
    );

    console.log({
      adjustedTokenAmount: adjustedTokenAmount.toString(),
    });

    const price = await mcr.calculateTokenPriceForDeltaEth(initialAssetValue, nextAssetValue, mcrEth);
    const { tokens: tokensPurchased, price: expectedPrice } = calculatePurchasedTokens(
      initialAssetValue, deltaEth, mcrEth, c, a, tokenExponent
    );

    console.log({
      price: price.toString() / 1e18,
      expectedPrice: expectedPrice.toString() / 1e18,
      tokensPurchased: tokensPurchased.toString()
    });
  });
});
