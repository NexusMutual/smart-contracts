const { ether, time } = require('@openzeppelin/test-helpers');
const { getQuoteSignature } = require('./getQuote');
const { web3 } = require('hardhat');
const { toBN } = web3.utils;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function coverToCoverDetailsArray (cover) {
  return [cover.amount, cover.price, cover.priceNXM, cover.expireTime, cover.generationTime];
}

async function buyCover ({ cover, coverHolder, qt, p1 }) {

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

async function buyCoverWithDai ({ cover, coverHolder, qt, p1, dai }) {

  const vrsData = await getQuoteSignature(
    coverToCoverDetailsArray(cover),
    cover.currency,
    cover.period,
    cover.contractAddress,
    qt.address,
  );

  const coverPrice = toBN(cover.price);

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

async function getBuyCoverDataParameter ({ qt, coverData }) {

  // encoded data and signature uses unit price.
  const unitAmount = toBN(coverData.amount).div(ether('1')).toString();
  const [v, r, s] = await getQuoteSignature(
    coverToCoverDetailsArray({ ...coverData, amount: unitAmount }),
    coverData.currency,
    coverData.period,
    coverData.contractAddress,
    qt.address,
  );
  return web3.eth.abi.encodeParameters(
    ['uint', 'uint', 'uint', 'uint', 'uint8', 'bytes32', 'bytes32'],
    [coverData.price, coverData.priceNXM, coverData.expireTime, coverData.generationTime, v, r, s],
  );
}

async function buyCoverThroughGateway ({ coverData, gateway, coverHolder, qt, dai }) {

  const price = toBN(coverData.price);
  // encoded data and signature uses unit price.
  const data = await getBuyCoverDataParameter({ qt, coverData });

  if (coverData.asset === ETH) {
    return gateway.buyCover(
      coverData.contractAddress,
      coverData.asset,
      coverData.amount,
      coverData.period,
      coverData.type,
      data, {
        from: coverHolder,
        value: price,
      });
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
      data, {
        from: coverHolder,
      });
  }

  throw new Error(`Unknown asset ${coverData.asset}`);
}

module.exports = { buyCover, coverToCoverDetailsArray, buyCoverWithDai, buyCoverThroughGateway };
