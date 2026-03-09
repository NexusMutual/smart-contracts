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
 * @param {object} params
 * @param {object} params.orderDetails
 * @param {object} params.executionDetails
 * @param {{ name?: string, version?: string, chainId?: number }} [options]
 * @returns {Promise<{ digest: string, signature: string }>}
 */
const signLimitOrder = async (signer, verifyingContract, params, options = {}) => {
  const defaults = { name: 'NexusMutualLimitOrders', version: '1.0.0' };
  const config = { ...defaults, ...options };

  if (config.chainId === undefined) {
    config.chainId = (await signer.provider.getNetwork()).chainId;
  }

  const verifier = await getAddress(verifyingContract);
  const domain = {
    name: config.name,
    version: config.version,
    chainId: config.chainId,
    verifyingContract: verifier,
  };

  const types = {
    ExecuteOrder: [
      { name: 'orderDetails', type: 'OrderDetails' },
      { name: 'executionDetails', type: 'ExecutionDetails' },
    ],
    OrderDetails: [
      { name: 'coverId', type: 'uint256' },
      { name: 'productId', type: 'uint24' },
      { name: 'amount', type: 'uint96' },
      { name: 'period', type: 'uint32' },
      { name: 'paymentAsset', type: 'uint8' },
      { name: 'coverAsset', type: 'uint8' },
      { name: 'owner', type: 'address' },
      { name: 'ipfsData', type: 'string' },
      { name: 'commissionRatio', type: 'uint16' },
      { name: 'commissionDestination', type: 'address' },
    ],
    ExecutionDetails: [
      { name: 'buyer', type: 'address' },
      { name: 'notExecutableBefore', type: 'uint256' },
      { name: 'executableUntil', type: 'uint256' },
      { name: 'renewableUntil', type: 'uint256' },
      { name: 'renewablePeriodBeforeExpiration', type: 'uint256' },
      { name: 'maxPremiumInAsset', type: 'uint256' },
    ],
  };

  const digest = ethers.TypedDataEncoder.hash(domain, types, params);
  const signature = await signer.signTypedData(domain, types, params);

  return { digest, signature };
};

/**
 * @typedef {object} RiDataV1Entry
 * @property {bigint|number} amount
 * @property {bigint|number} vaultId
 * @property {bigint|number} subnetworkId
 * @property {bigint|number} providerId
 */

/**
 * @typedef {RiDataV1Entry[]} RiData
 */

/**
 * @param {RiData} data
 * @param {bigint|number} formatVersion
 * @returns {string}
 */
const encodeRiData = (data, formatVersion) => {
  const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder();

  if (formatVersion === 1) {
    return defaultAbiCoder.encode(
      ['tuple(uint256 amount,uint256 vaultId,uint256 subnetworkId,uint256 providerId)[]'],
      [data],
    );
  }

  throw new Error(`Unsupported data format version: ${formatVersion}`);
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
      { name: 'data', type: 'bytes' },
      { name: 'dataFormat', type: 'uint8' },
      { name: 'deadline', type: 'uint32' },
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
    data: quote.data,
    dataFormat: quote.dataFormat,
    deadline: quote.deadline,
    nonce: quote.nonce,
  };

  return signer.signTypedData(domain, types, values);
};

module.exports = { signJoinMessage, signRiQuote, signLimitOrder, encodeRiData };
