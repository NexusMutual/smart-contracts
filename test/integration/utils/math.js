/**
 * Division with ceiling rounding - equivalent to Math.ceil(a / b) for BigInt
 */
function divCeil(a, b) {
  return (a + b - 1n) / b;
}

/**
 * Get minimum of two BigInt values
 */
function min(a, b) {
  return a < b ? a : b;
}

/**
 * Get maximum of two BigInt values
 */
function max(a, b) {
  return a > b ? a : b;
}

/**
 * Round up to the nearest multiple of a given unit
 * Example: roundUpToMultiple(7n, 3n) = 9n
 */
function roundUpToMultiple(value, unit) {
  return divCeil(value, unit) * unit;
}

/**
 * Sum an array of BigInt values
 */
function sum(arr) {
  return arr.reduce((x, y) => x + y, 0n);
}

module.exports = {
  divCeil,
  min,
  max,
  roundUpToMultiple,
  sum,
};
