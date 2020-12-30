const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');
const { toBN } = web3.utils;
const { hex } = require('../utils').helpers;
const { Assets: { ETH } } = require('../utils').constants;
const { coverToCoverDetailsArray } = require('../utils/buyCover');
const { getQuoteSignature } = require('../utils/getQuote');

const ethCoverTemplate = {
  amount: ether('1'), // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  asset: ETH,
  period: 60,
  type: 0,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const daiCoverTemplate = {
  amount: ether('1000'), // 1000 dai
  price: 1e19.toString(), // 10 dai
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('DAI'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
  type: 0,
};

async function buyCover ({ coverData, cover, coverHolder, qt, assetToken }) {

  const price = toBN(coverData.price);
  // encoded data and signature uses unit price.
  const unitAmount = toBN(coverData.amount).div(ether('1')).toString();
  const [v, r, s] = await getQuoteSignature(
    coverToCoverDetailsArray({ ...coverData, amount: unitAmount }),
    coverData.currency,
    coverData.period,
    coverData.contractAddress,
    qt.address,
  );
  const data = web3.eth.abi.encodeParameters(
    ['uint', 'uint', 'uint', 'uint', 'uint8', 'bytes32', 'bytes32'],
    [price, coverData.priceNXM, coverData.expireTime, coverData.generationTime, v, r, s],
  );

  let tx;
  if (coverData.asset === ETH) {
    tx = await cover.buyCover(
      coverData.contractAddress,
      coverData.asset,
      coverData.amount,
      coverData.period,
      coverData.type,
      data, {
        from: coverHolder,
        value: price,
      });
  } else {
    await assetToken.approve(cover.address, price, {
      from: coverHolder,
    });
    tx = await cover.buyCover(
      coverData.contractAddress,
      coverData.asset,
      coverData.amount,
      coverData.period,
      coverData.type,
      data, {
        from: coverHolder,
      });
  }

  return tx;
}

module.exports = {
  ethCoverTemplate,
  daiCoverTemplate,
  buyCover,
};
