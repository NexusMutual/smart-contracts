const { accounts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;
const { buyCover, buyCoverWithDai } = require('../utils').buyCover;
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;

const [, member1, nonMember1] = accounts;

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

    await buyCover({ ...this.contracts, cover, coverHolder: member });
    const totalAssurance = await mcr.getAllSumAssurance();
    assert.equal(totalAssurance.toString(), ether(cover.amount.toString()).toString());
  });

  it('returns total value of DAI purchased cover', async function () {
    const { mcr } = this.contracts;
    const { daiToEthRate } = this.rates;
    const cover = { ...daiCoverTemplate };
    const member = member1;

    await buyCoverWithDai({ ...this.contracts, cover, coverHolder: member });
    const totalAssurance = await mcr.getAllSumAssurance();
    const expectedTotalAssurance = ether(cover.amount.toString()).mul(daiToEthRate).div(toBN(1e18.toString()));
    assert.equal(totalAssurance.toString(), expectedTotalAssurance.toString());
  });

  it('returns total value of multiple ETH and DAI covers', async function () {
    const { mcr } = this.contracts;
    const { daiToEthRate } = this.rates;
    const cover = { ...daiCoverTemplate };
    const member = member1;

    const ethCoversToBuy = 2;
    let generationTime = parseInt(cover.generationTime);
    for (let i = 0; i < ethCoversToBuy; i++) {
      const newCover = { ...ethCoverTemplate, generationTime: (generationTime++).toString() };
      await buyCover({ ...this.contracts, cover: newCover, coverHolder: member });
    }

    const daiCoversToBuy = 2;
    for (let i = 0; i < daiCoversToBuy; i++) {
      const newCover = { ...daiCoverTemplate, generationTime: (generationTime++).toString() };
      await buyCoverWithDai({ ...this.contracts, cover: newCover, coverHolder: member });
    }

    const totalAssurance = await mcr.getAllSumAssurance();
    const expectedTotalAssurance =
      ether(daiCoverTemplate.amount.toString()).mul(daiToEthRate).div(toBN(1e18.toString())).muln(daiCoversToBuy)
        .add(ether(ethCoverTemplate.amount.toString()).muln(ethCoversToBuy));
    assert.equal(totalAssurance.toString(), expectedTotalAssurance.toString());
  });
});
