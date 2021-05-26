const { ether, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { toBN } = web3.utils;
const { hex } = require('../utils').helpers;
const { Assets: { ETH } } = require('../utils').constants;
const { coverToCoverDetailsArray } = require('../utils').buyCover;
const { getQuoteSignature } = require('../utils').getQuote;

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
  generationTime: '1600000000001',
  currency: hex('DAI'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
  type: 0,
};

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

async function buyCover ({ coverData, gateway, coverHolder, qt, dai }) {

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

async function voteOnClaim ({ claimId, verdict, cl, cd, master, voter }) {
  await cl.submitCAVote(claimId, verdict, { from: voter });

  const minVotingTime = await cd.minVotingTime();
  await time.increase(minVotingTime.addn(1));

  const voteStatusBefore = await cl.checkVoteClosing(claimId);
  assert.equal(voteStatusBefore.toString(), '1', 'should allow vote closing');

  await master.closeClaim(claimId);
  const voteStatusAfter = await cl.checkVoteClosing(claimId);
  assert(voteStatusAfter.eqn(-1), 'voting should be closed');
}

module.exports = {
  ethCoverTemplate,
  daiCoverTemplate,
  buyCover,
  getBuyCoverDataParameter,
  voteOnClaim,
};
