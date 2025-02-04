const { ethers } = require('hardhat');
const { getQuoteSignature } = require('./getQuote');
const { parseEther, defaultAbiCoder } = ethers.utils;
const { BigNumber } = ethers;
const { _TypedDataEncoder } = ethers.utils;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function coverToCoverDetailsArray(cover) {
  return [cover.amount, cover.price, cover.priceNXM, cover.expireTime, cover.generationTime];
}

async function buyCover({ cover, coverHolder, qt, p1 }) {
  const signature = await getQuoteSignature(
    coverToCoverDetailsArray(cover),
    cover.currency,
    cover.period,
    cover.contractAddress,
    qt.address,
  );

  return p1.makeCoverBegin(
    cover.contractAddress,
    cover.currency,
    coverToCoverDetailsArray(cover),
    cover.period,
    signature[0],
    signature[1],
    signature[2],
    { from: coverHolder, value: cover.price },
  );
}

async function buyCoverWithDai({ cover, coverHolder, qt, p1, dai }) {
  const vrsData = await getQuoteSignature(
    coverToCoverDetailsArray(cover),
    cover.currency,
    cover.period,
    cover.contractAddress,
    qt.address,
  );

  const coverPrice = BigNumber.from(cover.price);

  await dai.approve(p1.address, coverPrice, { from: coverHolder });

  return p1.makeCoverUsingCA(
    cover.contractAddress,
    cover.currency,
    coverToCoverDetailsArray(cover),
    cover.period,
    vrsData[0],
    vrsData[1],
    vrsData[2],
    { from: coverHolder },
  );
}

async function getBuyCoverDataParameter({ qt, coverData }) {
  // encoded data and signature uses unit price.
  const unitAmount = BigNumber.from(coverData.amount).div(parseEther('1')).toString();
  const [v, r, s] = await getQuoteSignature(
    coverToCoverDetailsArray({ ...coverData, amount: unitAmount }),
    coverData.currency,
    coverData.period,
    coverData.contractAddress,
    qt.address,
  );
  return defaultAbiCoder.encode(
    ['uint', 'uint', 'uint', 'uint', 'uint8', 'bytes32', 'bytes32'],
    [coverData.price, coverData.priceNXM, coverData.expireTime, coverData.generationTime, v, r, s],
  );
}

async function buyCoverThroughGateway({ coverData, gateway, coverHolder, qt, dai }) {
  const price = BigNumber.from(coverData.price);
  // encoded data and signature uses unit price.
  const data = await getBuyCoverDataParameter({ qt, coverData });

  if (coverData.asset === ETH) {
    return gateway.buyCover(
      coverData.contractAddress,
      coverData.asset,
      coverData.amount,
      coverData.period,
      coverData.type,
      data,
      {
        from: coverHolder,
        value: price,
      },
    );
  } else if (coverData.asset === dai.address) {
    await dai.approve(gateway.address, price, {
      from: coverHolder,
    });
    return gateway.buyCover(
      coverData.contractAddress,
      coverData.asset,
      coverData.amount,
      coverData.period,
      coverData.type,
      data,
      {
        from: coverHolder,
      },
    );
  }

  throw new Error(`Unknown asset ${coverData.asset}`);
}

async function signCoverOrder(contractAddress, params, signer) {
  const { chainId } = await ethers.provider.getNetwork();

  const domain = {
    name: 'NexusMutualCoverOrder',
    version: '1',
    chainId,
    verifyingContract: contractAddress,
  };

  const types = {
    ExecuteOrder: [
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
      { name: 'executionDetails', type: 'ExecutionDetails' },
    ],
    ExecutionDetails: [
      { name: 'notBefore', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'maxPremiumInAsset', type: 'uint256' },
      { name: 'maxNumberOfRenewals', type: 'uint8' },
      { name: 'renewWhenLeft', type: 'uint32' },
    ],
  };

  // Populate any ENS names
  const populated = await _TypedDataEncoder.resolveNames(domain, types, params, name => {
    return this.provider.resolveName(name);
  });

  const digest = _TypedDataEncoder.hash(populated.domain, types, populated.value);

  const signature = signer._signTypedData(domain, types, params);

  return { digest, signature };
}

module.exports = {
  buyCover,
  signCoverOrder,
  coverToCoverDetailsArray,
  buyCoverWithDai,
  buyCoverThroughGateway,
};
