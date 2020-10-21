const Decimal = require('decimal.js');
const fs = require('fs');
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
function calculatePurchasedTokensWithFullIntegral (
  initialAssetValue, deltaEth, mcrEth, c, a
) {
  initialAssetValue = Decimal(initialAssetValue);
  deltaEth = Decimal(deltaEth);
  const nextAssetValue = initialAssetValue.add(deltaEth);

  const mcrEthDecimal = Decimal(mcrEth);
  const CDecimal = Decimal(c);
  const m = Decimal(1).div(CDecimal.mul(mcrEthDecimal.pow(3)));
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

  const tokens = integral(nextAssetValue).sub(integral(initialAssetValue));
  const price = deltaEth.div(tokens);
  return {
    tokens,
    price
  }
}

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
  const finalPrice = averageAdjustedPrice.add(new BN(a));
  const tokens = deltaEth.mul(wad).div(finalPrice);

  return {
    tokens,
    price: finalPrice
  };
}

module.exports = {
  calculatePurchasedTokens,
  A,
  C,
  tokenExponent
}
