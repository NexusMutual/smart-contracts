const { BigIntMath } = require('./helpers');

// TODO: move to unit test file using it
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

// TODO: move to test/unit/Pool/setup.js
function calculateCurrentMCR(
  { stored, desired, now, updatedAt },
  { MAX_MCR_INCREMENT, MAX_MCR_ADJUSTMENT, BASIS_PRECISION },
) {
  const changeBps = BigIntMath.min((MAX_MCR_INCREMENT * (now - updatedAt)) / 86400n, MAX_MCR_ADJUSTMENT);

  return desired > stored
    ? BigIntMath.min((stored * (changeBps + BASIS_PRECISION)) / BASIS_PRECISION, desired)
    : BigIntMath.max((stored * (BASIS_PRECISION - changeBps)) / BASIS_PRECISION, desired);
}

module.exports = { setMCR, calculateCurrentMCR };
