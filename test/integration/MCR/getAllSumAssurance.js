const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const Decimal = require('decimal.js');
const { toBN } = web3.utils;
const { coverToCoverDetailsArray } = require('../utils/buyCover');
const { getSignedQuote } = require('../utils/getQuote');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;

const [, member1, nonMember1] = accounts;

async function buyCover ({ cover, coverHolder, qt, p1, dai, paymentAsset }) {

  const vrsData = await getSignedQuote(
    coverToCoverDetailsArray(cover),
    cover.currency,
    cover.period,
    cover.contractAddress,
    qt.address,
  );

  if (paymentAsset === ETH) {
    return p1.makeCoverBegin(
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

  if (paymentAsset === dai.address) {
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

  throw new Error(`Unknown asset: ${paymentAsset}`);
}

const ethCoverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const daiCoverTemplate = {
  amount: 1000, // 1000 dai
  price: 1e19.toString(), // 10 dai
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('DAI'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

describe('getAllSumAssurance', function () {

  beforeEach(async function () {
    const { dai } = this.contracts;
    await enrollMember(this.contracts, [member1]);
    for (const daiHolder of [member1, nonMember1]) {
      await dai.mint(daiHolder, ether('10000000'));
    }
  });

  it('returns 0 when no covers exist', async function () {
    const { mcr } = this.contracts;

    const totalAssurace = await mcr.getAllSumAssurance();
    assert.equal(totalAssurace.toString(), '0');
  });

  it('returns total value of ETH purchased cover', async function () {
    const { mcr } = this.contracts;
    const cover = { ...ethCoverTemplate };
    const member = member1;

    await buyCover({ ...this.contracts, cover, coverHolder: member, paymentAsset: ETH });
    const totalAssurance = await mcr.getAllSumAssurance();
    assert.equal(totalAssurance.toString(), ether(cover.amount.toString()).toString());
  });

  it('returns total value of DAI purchased cover', async function () {
    const { mcr, dai } = this.contracts;
    const { daiToEthRate } = this.rates;
    const cover = { ...daiCoverTemplate };
    const member = member1;

    await buyCover({ ...this.contracts, cover, coverHolder: member, paymentAsset: dai.address });
    const totalAssurance = await mcr.getAllSumAssurance();
    const expectedTotalAssurance = ether(cover.amount.toString()).mul(daiToEthRate).div(toBN(1e18.toString()));
    assert.equal(totalAssurance.toString(), expectedTotalAssurance.toString());
  });

  it('returns total value of multiple ETH and DAI covers', async function () {
    const { mcr, dai } = this.contracts;
    const { daiToEthRate } = this.rates;
    const cover = { ...daiCoverTemplate };
    const member = member1;

    const ethCoversToBuy = 2;
    let generationTime = parseInt(cover.generationTime);
    for (let i = 0; i < ethCoversToBuy; i++) {
      const newCover = { ...ethCoverTemplate, generationTime: (generationTime++).toString() };
      await buyCover({ ...this.contracts, cover: newCover, coverHolder: member, paymentAsset: ETH });
    }

    const daiCoversToBuy = 2;
    for (let i = 0; i < daiCoversToBuy; i++) {
      const newCover = { ...daiCoverTemplate, generationTime: (generationTime++).toString() };
      await buyCover({ ...this.contracts, cover: newCover, coverHolder: member, paymentAsset: dai.address });
    }

    const totalAssurance = await mcr.getAllSumAssurance();
    const expectedTotalAssurance =
      ether(daiCoverTemplate.amount.toString()).mul(daiToEthRate).div(toBN(1e18.toString())).muln(daiCoversToBuy)
        .add(ether(ethCoverTemplate.amount.toString()).muln(ethCoversToBuy));
    assert.equal(totalAssurance.toString(), expectedTotalAssurance.toString());
  });
});
