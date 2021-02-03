const { accounts, web3 } = require('hardhat');
const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;
const { buyCover, coverToCoverDetailsArray } = require('../utils/buyCover');
const { getQuoteSignature } = require('../utils/getQuote');
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;

const [, member1, nonMember1] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

describe('makeCoverBegin', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1]);
  });

  it('buys cover for member, ETH is added to pool, NXM is locked and cover fields stored', async function () {
    const { qd, p1: pool, tk: token, tf: tokenFunctions, qd: quotationData } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    const poolBalanceBefore = toBN(await web3.eth.getBalance(pool.address));
    const nxmSupplyBefore = await token.totalSupply();
    const memberNXMBalanceBefore = await token.balanceOf(member);
    await buyCover({ ...this.contracts, cover, coverHolder: member });

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), '2');

    const coverId = 1;
    const coverFieldsPart1 = await qd.getCoverDetailsByCoverID1(coverId);
    const coverFieldsPart2 = await qd.getCoverDetailsByCoverID2(coverId);
    const storedCover = { ...coverFieldsPart1, ...coverFieldsPart2 };

    assert.equal(storedCover._memberAddress, member);
    assert.equal(storedCover._scAddress, cover.contractAddress);
    assert.equal(storedCover._currencyCode, web3.utils.padRight(cover.currency, 8));
    assert.equal(storedCover._sumAssured.toString(), cover.amount);
    assert.equal(storedCover.premiumNXM.toString(), cover.priceNXM);
    assert.equal(storedCover.coverPeriod.toString(), cover.period);
    //  TODO: assert validUntil to be uint expiryDate = now.add(uint(_coverPeriod).mul(1 days));
    // assert.equal(storedCover.validUntil.toString(), cover.expireTime);

    const expectedCoverNoteLockedNXM = toBN(cover.priceNXM).divn(10);
    const memberCoverNoteLockedNXM = await tokenFunctions.getUserLockedCNTokens(member, 1);
    assert.equal(memberCoverNoteLockedNXM.toString(), expectedCoverNoteLockedNXM.toString());

    const poolBalanceAfter = toBN(await web3.eth.getBalance(pool.address));
    assert.equal(poolBalanceAfter.toString(), poolBalanceBefore.add(toBN(cover.price)).toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('ETH'));
    const expectedTotalSumAsssured = toBN(cover.amount);
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    // member balance remains the same
    const memberNXMBalanceAfter = await token.balanceOf(member);
    assert.equal(memberNXMBalanceAfter.toString(), memberNXMBalanceBefore.toString());

    const expectedTotalNXMSupply = nxmSupplyBefore.add(expectedCoverNoteLockedNXM);
    const totalNXMSupplyAfter = await token.totalSupply();
    assert.equal(expectedTotalNXMSupply.toString(), totalNXMSupplyAfter.toString());
  });

  it('buys multiple covers in a row for member', async function () {
    const { qd, p1: pool, tk: token, tf: tokenFunctions, qd: quotationData } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    const poolBalanceBefore = toBN(await web3.eth.getBalance(pool.address));
    const nxmSupplyBefore = await token.totalSupply();
    const memberNXMBalanceBefore = await token.balanceOf(member);

    const coversToBuy = 3;
    let generationTime = parseInt(cover.generationTime);
    for (let i = 0; i < coversToBuy; i++) {
      const newCover = { ...cover, generationTime: (generationTime++).toString() };
      await buyCover({ ...this.contracts, cover: newCover, coverHolder: member });
    }

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), (coversToBuy + 1).toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('ETH'));
    const expectedTotalSumAsssured = toBN(cover.amount).muln(coversToBuy);
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    const poolBalanceAfter = toBN(await web3.eth.getBalance(pool.address));
    assert.equal(poolBalanceAfter.toString(), poolBalanceBefore.add(toBN(cover.price).muln(coversToBuy)).toString());
  });

  it('reverts when currency is not ETH', async function () {
    const cover = { ...coverTemplate, currency: hex('DAI') };
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
      'Pool: Unexpected asset type',
    );
  });

  it('reverts for non-member', async function () {
    const cover = { ...coverTemplate };
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder: nonMember1 }),
      'Caller is not a member',
    );
  });

  it('reverts if cover period < 30', async function () {
    const cover = { ...coverTemplate, period: 29 };
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
      'Quotation: Cover period out of bounds',
    );
  });

  it('reverts if cover period > 365', async function () {
    const cover = { ...coverTemplate, period: 366 };
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
      'Quotation: Cover period out of bounds',
    );
  });

  it('reverts if msg.value does not match cover premium', async function () {
    const { qt, p1 } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    const signature = await getQuoteSignature(
      coverToCoverDetailsArray(cover),
      cover.currency,
      cover.period,
      cover.contractAddress,
      qt.address,
    );

    await expectRevert(p1.makeCoverBegin(
      cover.contractAddress,
      cover.currency,
      coverToCoverDetailsArray(cover),
      cover.period,
      signature[0],
      signature[1],
      signature[2],
      { from: member, value: toBN(cover.price).subn(1) },
    ),
    'Pool: ETH amount does not match premium',
    );
  });

  it('reverts if smart contract address is the 0 address', async function () {
    const cover = { ...coverTemplate, contractAddress: '0x0000000000000000000000000000000000000000' };
    await expectRevert.unspecified(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
    );
  });

  it('reverts if quote validity is expired', async function () {
    const currentTime = await time.latest();
    const cover = { ...coverTemplate, expireTime: currentTime.subn(2) };
    await expectRevert.unspecified(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
    );
  });

  it('reverts if quote is reused', async function () {
    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    await expectRevert.unspecified(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
    );
  });

  it('reverts if NXM premium is 0', async function () {
    const cover = { ...coverTemplate, priceNXM: '0' };
    await expectRevert.unspecified(
      buyCover({ ...this.contracts, cover, coverHolder: member1 }),
    );
  });

  it('reverts if signed quote does not match quote parameters', async function () {
    const { qt, p1 } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    // sign a different amount than the one requested.
    const signature = await getQuoteSignature(
      coverToCoverDetailsArray({ ...cover, amount: cover.amount + 1 }),
      cover.currency,
      cover.period,
      cover.contractAddress,
      qt.address,
    );

    await expectRevert.unspecified(p1.makeCoverBegin(
      cover.contractAddress,
      cover.currency,
      coverToCoverDetailsArray(cover),
      cover.period,
      signature[0],
      signature[1],
      signature[2],
      { from: member, value: cover.price },
    ),
    );
  });
});
