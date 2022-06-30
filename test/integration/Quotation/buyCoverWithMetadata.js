const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN, soliditySha3 } = web3.utils;
const { coverToCoverDetailsArray } = require('../utils').buyCover;
const { getQuoteSignature } = require('../utils').getQuote;
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;

const [, member1, nonMember1] = accounts;

async function buyCover ({ cover, coverHolder, qt, payWithNXM = false, ipfsMetadata = '', value }) {
  console.log('before');
  const vrsData = await getQuoteSignature(
    coverToCoverDetailsArray(cover),
    cover.currency,
    cover.period,
    cover.contractAddress,
    qt.address,
  );
  console.log('middle');

  return qt.buyCoverWithMetadata(
    coverToCoverDetailsArray(cover),
    cover.period,
    cover.currency,
    cover.contractAddress,
    vrsData[0],
    vrsData[1],
    vrsData[2],
    payWithNXM,
    ipfsMetadata,
    { from: coverHolder, value },
  );
}

const coverTemplate = {
  amount: 1000, // 1000 dai
  price: (1e19).toString(), // 10 dai
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('DAI'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const ipfsMetadata = 'ipfs cid goes here';

describe.only('buyCoverWithMetadata', function () {
  beforeEach(async function () {
    const { dai } = this.contracts;
    await enrollMember(this.contracts, [member1]);
    for (const daiHolder of [member1, nonMember1]) {
      await dai.mint(daiHolder, ether('10000000'));
    }
  });

  it('buys DAI cover with NXM for member, premium NXM is burned, NXM is locked and cover fields stored', async function () {
    const { qt, qd, p1: pool, tk: token, tc: tokenController, dai } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    const poolDAIBalanceBefore = await dai.balanceOf(pool.address);
    const nxmSupplyBefore = await token.totalSupply();
    const memberNXMBalanceBefore = await token.balanceOf(member);
    await buyCover({ ...this.contracts, cover, coverHolder: member, payWithNXM: true, ipfsMetadata });

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), '2');

    const coverId = 1;
    const coverFieldsPart1 = await qd.getCoverDetailsByCoverID1(coverId);
    const coverFieldsPart2 = await qd.getCoverDetailsByCoverID2(coverId);
    const storedCover = { ...coverFieldsPart1, ...coverFieldsPart2 };
    const coverMetadata = await qt.coverMetadata(coverId);

    assert.equal(storedCover._memberAddress, member);
    assert.equal(storedCover._scAddress, cover.contractAddress);
    assert.equal(storedCover._currencyCode, web3.utils.padRight(cover.currency, 8));
    assert.equal(storedCover._sumAssured.toString(), cover.amount);
    assert.equal(storedCover.premiumNXM.toString(), cover.priceNXM);
    assert.equal(storedCover.coverPeriod.toString(), cover.period);
    assert.equal(coverMetadata, ipfsMetadata);
    //  TODO: assert validUntil to be uint expiryDate = now.add(uint(_coverPeriod).mul(1 days));
    // assert.equal(storedCover.validUntil.toString(), cover.expireTime);

    const lockReason = soliditySha3(hex('CN'), member, coverId);
    const expectedCoverNoteLockedNXM = toBN(cover.priceNXM).divn(10);
    const memberCoverNoteLockedNXM = await tokenController.tokensLocked(member, lockReason);
    assert.equal(memberCoverNoteLockedNXM.toString(), expectedCoverNoteLockedNXM.toString());

    // no DAI is added to the pool
    const poolBalanceAfter = await dai.balanceOf(pool.address);
    assert.equal(poolBalanceAfter.toString(), poolDAIBalanceBefore.toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('DAI'));
    const expectedTotalSumAsssured = toBN(cover.amount);
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    // NXM is burned from the buyer
    const memberNXMBalanceAfter = await token.balanceOf(member);
    assert.equal(memberNXMBalanceAfter.toString(), memberNXMBalanceBefore.sub(toBN(cover.priceNXM)).toString());

    const expectedTotalNXMSupply = nxmSupplyBefore.add(expectedCoverNoteLockedNXM).sub(toBN(cover.priceNXM));
    const totalNXMSupplyAfter = await token.totalSupply();
    assert.equal(expectedTotalNXMSupply.toString(), totalNXMSupplyAfter.toString());
  });

  it('buys multiple covers in a row for member', async function () {
    const { qd, p1: pool, tk: token, tf: tokenFunctions, qd: quotationData, dai } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    const nxmSupplyBefore = await token.totalSupply();
    const memberNXMBalanceBefore = await token.balanceOf(member);

    const coversToBuy = 3;
    let generationTime = parseInt(cover.generationTime);
    for (let i = 0; i < coversToBuy; i++) {
      const newCover = { ...cover, generationTime: (generationTime++).toString() };
      await buyCover({ ...this.contracts, cover: newCover, coverHolder: member, ipfsMetadata });
    }

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), (coversToBuy + 1).toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('DAI'));
    const expectedTotalSumAsssured = toBN(cover.amount).muln(coversToBuy);
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    const memberNXMBalanceAfter = await token.balanceOf(member);
    assert.equal(
      memberNXMBalanceAfter.toString(),
      memberNXMBalanceBefore.sub(toBN(cover.priceNXM).muln(coversToBuy)).toString(),
    );

    const expectedCoverNoteLockedNXM = toBN(cover.priceNXM)
      .divn(10)
      .muln(coversToBuy);
    const expectedTotalNXMSupply = nxmSupplyBefore
      .add(expectedCoverNoteLockedNXM)
      .sub(toBN(cover.priceNXM).muln(coversToBuy));
    const totalNXMSupplyAfter = await token.totalSupply();
    assert.equal(expectedTotalNXMSupply.toString(), totalNXMSupplyAfter.toString());
  });

  it('reverts when currency is not a supported asset', async function () {
    const cover = { ...coverTemplate, currency: hex('BTC') };
    await expectRevert(buyCover({ ...this.contracts, cover, coverHolder: member1 }), 'ClaimsReward: unknown asset');
  });

  it('reverts for non-member', async function () {
    const cover = { ...coverTemplate };
    await expectRevert.unspecified(buyCover({ ...this.contracts, cover, coverHolder: nonMember1 }));
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

  it('reverts if approved NXM is less than premium + tokens to be locked', async function () {
    const { p1: pool, tk: token } = this.contracts;
    const cover = { ...coverTemplate };
    const member = member1;

    await token.approve(pool.address, toBN(cover.priceNXM).subn(1), { from: member });

    await expectRevert.unspecified(buyCover({ ...this.contracts, cover, coverHolder: member, payWithNXM: true }));
  });

  it('reverts if smart contract address is the 0 address', async function () {
    const cover = { ...coverTemplate, contractAddress: '0x0000000000000000000000000000000000000000' };
    await expectRevert.unspecified(buyCover({ ...this.contracts, cover, coverHolder: member1 }));
  });

  it('reverts when tx value does not match the premium when paying in ETH', async function () {
    const cover = { ...coverTemplate, currency: hex('ETH') };
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder: member1, value: toBN(coverTemplate.price).addn('1') }),
      'Quotation: ETH amount does not match premium',
    );
    await expectRevert(
      buyCover({ ...this.contracts, cover, coverHolder: member1, value: toBN(coverTemplate.price).subn('1') }),
      'Quotation: ETH amount does not match premium',
    );
  });

  it('reverts if quote validity is expired', async function () {
    const currentTime = await time.latest();
    const cover = { ...coverTemplate, expireTime: currentTime.subn(2) };
    await expectRevert.unspecified(buyCover({ ...this.contracts, cover, coverHolder: member1 }));
  });

  it('reverts if quote is reused', async function () {
    const cover = { ...coverTemplate };
    await buyCover({ ...this.contracts, cover, coverHolder: member1 });
    await expectRevert.unspecified(buyCover({ ...this.contracts, cover, coverHolder: member1 }));
  });

  it('reverts if NXM premium is 0', async function () {
    const cover = { ...coverTemplate, priceNXM: '0' };
    await expectRevert.unspecified(buyCover({ ...this.contracts, cover, coverHolder: member1 }));
  });

  it('reverts if signed quote does not match quote parameters', async function () {
    const { qt } = this.contracts;
    const cover = { ...coverTemplate };

    // sign a different amount than the one requested.
    const vrsData = await getQuoteSignature(
      coverToCoverDetailsArray({ ...cover, amount: cover.amount + 1 }),
      cover.currency,
      cover.period,
      cover.contractAddress,
      qt.address,
    );

    await expectRevert.unspecified(
      qt.buyCoverWithMetadata(
        coverToCoverDetailsArray(cover),
        cover.period,
        cover.currency,
        cover.contractAddress,
        vrsData[0],
        vrsData[1],
        vrsData[2],
        false,
        ipfsMetadata,
        { from: member1 },
      ),
    );
  });
});
