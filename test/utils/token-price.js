const Decimal = require('decimal.js');
const { toBN } = require('web3').utils;

const A = Decimal(0.01028);
const C = Decimal(5800000);
const tokenExponent = 4;
const sellSpread = Decimal(0.025);

/**
 *
 * Calculate the tokens using an integral as obtained by wolfram-alpha.
 * https://www.wolframalpha.com/input/?i=integral+dx+%2F+%28a+%2B+m*+x+%5E+4%29
 * Warning: this only works correctly for a token exponent of 4. Needs to be regenerated for a different token exponent.
 * (tanh^(-1)((sqrt(2) x (a m)^(1/4))/(sqrt(a) + sqrt(m) x^2)) - tan^(-1)(1 - sqrt(2) x (m/a)^(1/4)) + tan^(-1)(sqrt(2) x (m/a)^(1/4) + 1))/(2 sqrt(2) (a^3 m)^(1/4)) + constant
 *
 * @param initialAssetValue value in wei
 * @param deltaEth value in wei
 * @param mcrEth value in wei
 * @returns {{tokens: Decimal, price: Decimal | *}}
 */
function calculatePurchasedTokensWithFullIntegral (initialAssetValue, deltaEth, mcrEth) {

  const initialAssetValueDecimal = Decimal(initialAssetValue.toString()).div(1e18);
  const deltaEthDecimal = Decimal(deltaEth.toString()).div(1e18);
  const mcrEthDecimal = Decimal(mcrEth.toString()).div(1e18);
  const nextAssetValue = initialAssetValueDecimal.add(deltaEthDecimal);
  const m = Decimal(1).div(C.mul(mcrEthDecimal.pow(3)));
  function integral (x) {
    x = Decimal(x);
    const numeratorTerm1 =
      Decimal(2).sqrt()
        .mul(x)
        .mul((A.mul(m)).pow(1 / 4))
        .div((A.sqrt().add(m.sqrt().mul(x.pow(2)))))
        .atanh();

    const numeratorTerm2 =
      Decimal(1)
        .sub(Decimal(2).sqrt().mul(x).mul((m.div(A)).pow(1 / 4)))
        .atan();

    const numeratorTerm3 =
      Decimal(2).sqrt()
        .mul(x)
        .mul((m.div(A)).pow(0.25))
        .add(1)
        .atan();

    const numerator = numeratorTerm1.sub(numeratorTerm2).add(numeratorTerm3);
    const denominator = Decimal(2).mul(Decimal(2).sqrt()).mul((A.pow(3).mul(m)).pow(0.25));
    const result = numerator.div(denominator);
    return result;
  }

  const tokens = integral(nextAssetValue).sub(integral(initialAssetValueDecimal)).mul(1e18);
  const price = deltaEthDecimal.div(tokens).mul(1e18);
  return {
    tokens,
    price,
  };
}

/**
 *
 * @param totalAssetValue
 * @param mcrEth
 * @returns {Decimal}
 */
function getTokenSpotPrice (totalAssetValue, mcrEth) {
  const mcrRatio = Decimal(totalAssetValue.toString()).div(Decimal(mcrEth.toString())).toPrecision(5, Decimal.ROUND_DOWN);
  const mcrEthDecimal = Decimal(mcrEth.toString()).div(1e18);

  const mcrRatioRaisedToExponent = Decimal(mcrRatio).pow(tokenExponent);
  return Decimal(A).add(Decimal(mcrEthDecimal).div(C).mul(mcrRatioRaisedToExponent)).mul(1e18).round();
}

/**
 *
 * @param totalAssetValue
 * @param mcrEth
 * @returns {BN}
 */
function calculateMCRRatio (totalAssetValue, mcrEth) {
  const MCR_RATIO_DECIMALS = 4;
  return totalAssetValue.mul(toBN(10 ** MCR_RATIO_DECIMALS)).div(mcrEth);
}

/**
 *
 * @param totalAssetValue
 * @param buyValue
 * @param mcrEth
 * @param tokenValue
 * @returns {{relativeError: Decimal, expectedIdealTokenValue: Decimal}}
 */
function calculateNXMForEthRelativeError (totalAssetValue, buyValue, mcrEth, tokenValue) {
  const { tokens: expectedIdealTokenValue } = calculatePurchasedTokensWithFullIntegral(
    totalAssetValue, buyValue, mcrEth,
  );
  const tokensReceived = Decimal(tokenValue.toString());
  const relativeError = calculateRelativeError(tokensReceived, expectedIdealTokenValue);

  return {
    relativeError, expectedIdealTokenValue,
  };
}

/**
 *
 * @param buyValue
 * @param ethOut
 * @returns {{expectedEthOut: Decimal, relativeError: Decimal}}
 */
function calculateEthForNXMRelativeError (buyValue, ethOut) {
  const expectedEthOut = Decimal(buyValue.toString()).mul(Decimal(1).sub(sellSpread));

  const relativeError = calculateRelativeError(ethOut, expectedEthOut);
  return {
    relativeError,
    expectedEthOut,
  };
}

/**
 *
 * @param actual { number | string | BN | Decimal }
 * @param expected { number | string | BN | Decimal }
 * @returns {Decimal}
 */
function calculateRelativeError (actual, expected) {
  const actualDecimal = toDecimal(actual);
  const expectedDecimal = toDecimal(expected);
  return expectedDecimal.sub(actualDecimal).abs().div(expectedDecimal);
}

/**
 *
 * @param x
 * @param percentage
 * @returns {BN}
 */
function percentageBN (x, percentage) {
  return x.muln(percentage).divn(100);
}

function toDecimal (x) {
  return new Decimal(x.toString());
}

module.exports = {
  calculatePurchasedTokensWithFullIntegral,
  A,
  C,
  sellSpread,
  tokenExponent,
  getTokenSpotPrice,
  calculateMCRRatio,
  calculateNXMForEthRelativeError,
  calculateEthForNXMRelativeError,
  calculateRelativeError,
  percentageBN,
  toDecimal,
};
