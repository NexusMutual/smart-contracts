const { getQuoteValues } = require('./getQuote');

function coverToCoverDetailsArray (cover) {
  return [cover.amount, cover.price, cover.priceNXM, cover.expireTime, cover.generationTime];
}

async function buyCover ({ cover, coverHolder, qt, p1 }) {
  const vrsData = await getQuoteValues(
    coverToCoverDetailsArray(cover),
    cover.currency,
    cover.period,
    cover.contractAddress,
    qt.address,
  );
  await p1.makeCoverBegin(
    cover.contractAddress,
    cover.currency,
    coverToCoverDetailsArray(cover),
    cover.period,
    vrsData[0],
    vrsData[1],
    vrsData[2],
    { from: coverHolder, value: cover.price },
  );
}

module.exports = { buyCover };
