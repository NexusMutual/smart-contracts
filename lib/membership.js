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

module.exports = { signJoinMessage };
