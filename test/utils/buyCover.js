const { getQuoteSignature } = require('./getQuote');
const { web3 } = require('hardhat');
const { toBN } = web3.utils;

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
  console.log("approving");
  await dai.approve(p1.address, coverPrice, { from: coverHolder });
  console.log("approved");

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

module.exports = { buyCover, coverToCoverDetailsArray, buyCoverWithDai };
