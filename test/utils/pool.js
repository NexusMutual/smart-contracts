const { nexus } = require('hardhat');

const { BigIntMath } = nexus.helpers;

/**
 * @param {Addressable|AddressLike} poolAddress
 * @param {{ stored: bigint, desired: bigint, updatedAt: bigint }}
 * @param {Provider} provider
 */
async function setMCR(poolAddress, { stored, desired, updatedAt }, provider) {
  const slot = '0x3';

  const packed = stored | (desired << BigInt(80)) | (updatedAt << BigInt(160));

  const valueHex = '0x' + packed.toString(16).padStart(64, '0');

  await provider.send('hardhat_setStorageAt', [poolAddress, slot, valueHex]);

  await provider.send('evm_mine');
}

/**
 * Calculates the current MCR by gradually adjusting from stored toward desired,
 * respecting maximum daily adjustment limits based on time elapsed.
 * @param {Object} params - MCR state and timing parameters
 * @param {bigint} params.stored - The stored MCR value
 * @param {bigint} params.desired - The desired MCR value
 * @param {bigint} params.now - Current timestamp
 * @param {bigint} params.updatedAt - Timestamp when MCR was last updated
 * @param {Object} constants - MCR adjustment constants
 * @param {bigint} constants.MAX_MCR_INCREMENT - Maximum daily increment in basis points
 * @param {bigint} constants.MAX_MCR_ADJUSTMENT - Maximum adjustment cap in basis points
 * @param {bigint} constants.BASIS_PRECISION - Basis points precision (typically 10000)
 * @returns {bigint} The calculated current MCR value
 */
function calculateCurrentMCR(
  { stored, desired, now, updatedAt },
  { MAX_MCR_INCREMENT, MAX_MCR_ADJUSTMENT, BASIS_PRECISION },
) {
  const changeBps = BigIntMath.min((MAX_MCR_INCREMENT * (now - updatedAt)) / 86400n, MAX_MCR_ADJUSTMENT);

  return desired > stored
    ? BigIntMath.min((stored * (changeBps + BASIS_PRECISION)) / BASIS_PRECISION, desired)
    : BigIntMath.max((stored * (BASIS_PRECISION - changeBps)) / BASIS_PRECISION, desired);
}

module.exports = {
  calculateCurrentMCR,
  setMCR,
};
