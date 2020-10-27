const Decimal = require('decimal.js');
const { web3 } = require('@openzeppelin/test-environment');
const BN = require('bn.js');

const wad = new BN(1e18.toString());

const A = 0.01028;
const C = 5800000;
const tokenExponent = 4;

/**
 *
 * Calculate the tokens using an integral as obtained by wolfram-alpha.
 * https://www.wolframalpha.com/input/?i=integral+dx+%2F+%28a+%2B+m*+x+%5E+4%29
 * Warning: this only works correctly for a token exponent of 4. Needs to be regenerated for a different token exponent.
 * (tanh^(-1)((sqrt(2) x (a m)^(1/4))/(sqrt(a) + sqrt(m) x^2)) - tan^(-1)(1 - sqrt(2) x (m/a)^(1/4)) + tan^(-1)(sqrt(2) x (m/a)^(1/4) + 1))/(2 sqrt(2) (a^3 m)^(1/4)) + constant
 *
 * @param initialAssetValue
 * @param deltaEth
 * @param mcrEth
 * @param c
 * @param a
 * @returns {{tokens: Decimal, price: Decimal | *}}
 */
function calculatePurchasedTokensWithFullIntegral (initialAssetValue, deltaEth, mcrEth, c, a, tokenExponent) {
  if (tokenExponent.toString() !== tokenExponent.toString()) {
    throw new Error(`Only tokenExponent === ${tokenExponent} supported.`);
  }

  initialAssetValue = Decimal(initialAssetValue.toString()).div(1e18);
  deltaEth = Decimal(deltaEth.toString()).div(1e18);
  mcrEth = Decimal(mcrEth.toString()).div(1e18);
  a = Decimal(a.toString()).div(1e18);
  const nextAssetValue = initialAssetValue.add(deltaEth);
  const CDecimal = Decimal(c.toString());
  const m = Decimal(1).div(CDecimal.mul(mcrEth.pow(3)));
  a = Decimal(a);
  function integral (x) {
    x = Decimal(x);
    const numeratorTerm1 =
      Decimal(2).sqrt()
        .mul(x)
        .mul((a.mul(m)).pow(1 / 4))
        .div((a.sqrt().add(m.sqrt().mul(x.pow(2)))))
        .atanh();

    const numeratorTerm2 =
      Decimal(1)
        .sub(Decimal(2).sqrt().mul(x).mul((m.div(a)).pow(1 / 4)))
        .atan();

    const numeratorTerm3 =
      Decimal(2).sqrt()
        .mul(x)
        .mul((m.div(a)).pow(0.25))
        .add(1)
        .atan();

    const numerator = numeratorTerm1.sub(numeratorTerm2).add(numeratorTerm3);
    const denominator = Decimal(2).mul(Decimal(2).sqrt()).mul((a.pow(3).mul(m)).pow(0.25));
    const result = numerator.div(denominator);
    return result;
  }

  const tokens = integral(nextAssetValue).sub(integral(initialAssetValue)).mul(1e18);
  const price = deltaEth.div(tokens).mul(1e18);
  return {
    tokens,
    price
  }
};

/**
 *  Calculate the purchased tokens with the on-chain formula
 * @param initialAssetValue
 * @param deltaEth
 * @param mcrEth
 * @param c
 * @param a
 * @param tokenExponent
 * @returns {{tokens: Decimal, price: Decimal}}
 */
function calculatePurchasedTokens (
  initialAssetValue, deltaEth, mcrEth, c, a, tokenExponent
) {
  c = new BN(c.toString());
  a = new BN((a).toString());
  mcrEth = new BN(mcrEth.toString());
  initialAssetValue = new BN(initialAssetValue.toString());
  deltaEth = new BN(deltaEth.toString());
  const nextAssetValue = initialAssetValue.add(deltaEth);
  function integral (point) {
    point = new BN(point);
    let result = mcrEth.mul(c).muln(-1).divn(3).div(point);
    for (let i = 0; i < tokenExponent - 2; i++) {
      result = result.mul(mcrEth).div(point);
    }
    return result;
  }
  const adjustedTokenAmount = integral(nextAssetValue).sub(integral(initialAssetValue));
  const averageAdjustedPrice = deltaEth.div(adjustedTokenAmount);

  console.log({
    adjustedTokenAmount: adjustedTokenAmount.toString() / 1e18,
    mcrEth: mcrEth.toString(),
    c: c.toString()
  })

  const finalPrice = averageAdjustedPrice.add(new BN(a));
  const tokens = deltaEth.mul(wad).div(finalPrice);

  return {
    tokens,
    price: finalPrice
  };
}

/**
 * 1. Calculate spot price and amount of ETH at current values
 * 2. Calculate spot price and amount of ETH using V = V0 - ETH from step 1
 * 3. Min [average[Price(1), Price(2)] x ( 1 - Sell Spread), Price(2) ]
 */
function calculateSellValue (initialAssetValue, mcrEth, nxmToSell, sellSpread) {

  initialAssetValue = Decimal(initialAssetValue.toString()).div(1e18);
  mcrEth = Decimal(mcrEth.toString()).div(1e18);
  nxmToSell = Decimal(nxmToSell.toString()).div(1e18);
  sellSpread = Decimal(sellSpread);
  const MCRPerc0 = initialAssetValue.div(mcrEth);
  const spotPrice0 = getPriceDecimal(MCRPerc0, mcrEth);
  const spotETH = nxmToSell.mul(spotPrice0);
  const Vt1 = initialAssetValue.sub(spotETH);
  const MCRPerc1 = Vt1.div(mcrEth);
  const spotPrice1 = getPriceDecimal(MCRPerc1, mcrEth);
  const leftPrice = spotPrice0.add(spotPrice1).div(2).mul(Decimal(1).sub(sellSpread));
  const finalPrice = Decimal.min(leftPrice, spotPrice1);
  const ethEstimate = finalPrice.mul(nxmToSell).mul(1e18);
  return {
    ethEstimate
  };
}

module.exports = {
  calculatePurchasedTokens,
  calculatePurchasedTokensWithFullIntegral,
  calculateSellValue,
  A,
  C,
  tokenExponent
}
