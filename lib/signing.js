const { ethers } = require('ethers');

/**
 * @typedef {import('ethers').AddressLike} AddressLike
 */

/**
 * @param {AddressLike} addresslike
 * @returns {Promise<string>}
 */
const getAddress = async addresslike => {
  return ethers.isAddress(addresslike) ? addresslike : await addresslike.getAddress();
};

/**
 * @param {import('ethers').Signer} signer
 * @param {AddressLike} member
 * @param {AddressLike} verifyingContract
 * @param {{ name: string, version: string, chainId: number }} [options]
 * @returns {Promise<string>}
 */
const signJoinMessage = async (signer, member, verifyingContract, options = {}) => {
  const defaults = { name: 'NexusMutualRegistry', version: '1.0.0' };
  const config = { ...defaults, ...options };

  if (config.chainId === undefined) {
    config.chainId = (await signer.provider.getNetwork()).chainId;
  }

  const memberAddress = await getAddress(member);
  const verifier = await getAddress(verifyingContract);

  const name = config.name;
  const version = config.version;
  const chainId = config.chainId;

  const domain = { name, version, chainId, verifyingContract: verifier };

  const types = { Join: [{ name: 'member', type: 'address' }] };
  const value = { member: memberAddress };

  return signer.signTypedData(domain, types, value);
};

/**
 * @param {import('ethers').Signer} signer
 * @param {AddressLike} verifyingContract
 * @param {object} quote
 * @param {bigint|number} quote.coverId
 * @param {bigint|number} quote.productId
 * @param {bigint|number} quote.providerId
 * @param {bigint|number} quote.amount
 * @param {bigint|number} quote.premium
 * @param {bigint|number} quote.period
 * @param {bigint|number} quote.coverAsset
 * @param {bigint|number} quote.nonce
 * @param {{ name?: string, version?: string, chainId?: number }} [options]
 * @returns {Promise<string>}
 */
const signRiQuote = async (signer, verifyingContract, quote, options = {}) => {
  const defaults = { name: 'NexusMutualCover', version: '1.0.0' };
  const config = { ...defaults, ...options };

  if (config.chainId === undefined) {
    config.chainId = (await signer.provider.getNetwork()).chainId;
  }

  const name = config.name;
  const version = config.version;
  const chainId = config.chainId;

  const verifier = verifyingContract.target || verifyingContract;
  const domain = { name, version, chainId, verifyingContract: verifier };

  const types = {
    RiQuote: [
      { name: 'coverId', type: 'uint256' },
      { name: 'productId', type: 'uint24' },
      { name: 'providerId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
      { name: 'period', type: 'uint32' },
      { name: 'coverAsset', type: 'uint8' },
      { name: 'nonce', type: 'uint256' },
    ],
  };

  const values = {
    coverId: quote.coverId ?? 0,
    productId: quote.productId,
    providerId: quote.providerId,
    amount: quote.amount,
    premium: quote.premium,
    period: quote.period,
    coverAsset: quote.coverAsset,
    nonce: quote.nonce,
  };

  return signer.signTypedData(domain, types, values);
};

module.exports = { signJoinMessage, signRiQuote };
