const { accounts, web3 } = require('hardhat');
const { expectRevert, ether, time, expectEvent } = require('@openzeppelin/test-helpers');
const { toBN, soliditySha3 } = web3.utils;
const { coverToCoverDetailsArray } = require('../utils').buyCover;
const { getQuoteSignature } = require('../utils').getQuote;
const { enrollMember } = require('../utils/enroll');
const { hex } = require('../utils').helpers;
const { buyCover, ethCoverTemplate, daiCoverTemplate, getBuyCoverDataParameter } = require('./utils');

const [, member1, nonMember1] = accounts;

describe.only('buyCover', function () {
  beforeEach(async function () {
    await enrollMember(this.contracts, [member1]);
  });

  it('buys cover for member, ETH is added to pool, NXM is locked and cover fields stored', async function () {
    const { qd, p1: pool, tk: token, tc: tokenController } = this.contracts;
    const coverData = { ...ethCoverTemplate };
    const member = member1;

    const poolBalanceBefore = toBN(await web3.eth.getBalance(pool.address));
    const nxmSupplyBefore = await token.totalSupply();
    const memberNXMBalanceBefore = await token.balanceOf(member);
    const buyCoverTx = await buyCover({ ...this.contracts, coverData, coverHolder: member });

    const coverId = 1;
    const data = await getBuyCoverDataParameter({ ...this.contracts, coverData });
    await expectEvent(buyCoverTx, 'CoverBought', {
      coverId: coverId.toString(),
      buyer: member,
      contractAddress: coverData.contractAddress,
      coverAsset: coverData.asset,
      sumAssured: coverData.amount.toString(),
      coverPeriod: coverData.period.toString(),
      coverType: coverData.type.toString(),
      data,
    });

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), '2');

    const coverFieldsPart1 = await qd.getCoverDetailsByCoverID1(coverId);
    const coverFieldsPart2 = await qd.getCoverDetailsByCoverID2(coverId);
    const storedCover = { ...coverFieldsPart1, ...coverFieldsPart2 };

    const sumAssuredUnit = coverData.amount.div(toBN((1e18).toString()));

    assert.equal(storedCover._memberAddress, member);
    assert.equal(storedCover._scAddress, coverData.contractAddress);
    assert.equal(storedCover._currencyCode, web3.utils.padRight(coverData.currency, 8));
    assert.equal(storedCover._sumAssured.toString(), sumAssuredUnit.toString());
    assert.equal(storedCover.premiumNXM.toString(), coverData.priceNXM);
    assert.equal(storedCover.coverPeriod.toString(), coverData.period);
    //  TODO: assert validUntil to be uint expiryDate = now.add(uint(_coverPeriod).mul(1 days));
    // assert.equal(storedCover.validUntil.toString(), cover.expireTime);

    const lockReason = soliditySha3(hex('CN'), member, coverId);
    const expectedCoverNoteLockedNXM = toBN(coverData.priceNXM).divn(10);
    const memberCoverNoteLockedNXM = await tokenController.tokensLocked(member, lockReason);
    assert.equal(memberCoverNoteLockedNXM.toString(), expectedCoverNoteLockedNXM.toString());

    const poolBalanceAfter = toBN(await web3.eth.getBalance(pool.address));
    assert.equal(poolBalanceAfter.toString(), poolBalanceBefore.add(toBN(coverData.price)).toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('ETH'));
    const expectedTotalSumAsssured = sumAssuredUnit;
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    // member balance remains the same
    const memberNXMBalanceAfter = await token.balanceOf(member);
    assert.equal(memberNXMBalanceAfter.toString(), memberNXMBalanceBefore.toString());

    const expectedTotalNXMSupply = nxmSupplyBefore.add(expectedCoverNoteLockedNXM);
    const totalNXMSupplyAfter = await token.totalSupply();
    assert.equal(expectedTotalNXMSupply.toString(), totalNXMSupplyAfter.toString());
  });

  it('buy DAI cover for member', async function () {
    const { qd, p1: pool, tk: token, tf: tokenFunctions, qd: quotationData, dai } = this.contracts;
    const cover = { ...daiCoverTemplate, asset: dai.address };
    const member = member1;

    await dai.mint(member, ether('25000'));
    const poolDaiBalanceBefore = await dai.balanceOf(pool.address);
    await buyCover({ ...this.contracts, coverData: cover, coverHolder: member });

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), '2');

    const coverId = 1;
    const coverFieldsPart1 = await qd.getCoverDetailsByCoverID1(coverId);
    const coverFieldsPart2 = await qd.getCoverDetailsByCoverID2(coverId);
    const storedCover = { ...coverFieldsPart1, ...coverFieldsPart2 };

    const sumAssuredUnit = cover.amount.div(toBN((1e18).toString()));

    assert.equal(storedCover._currencyCode, web3.utils.padRight(cover.currency, 8));
    assert.equal(storedCover._sumAssured.toString(), sumAssuredUnit.toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('DAI'));
    const expectedTotalSumAsssured = sumAssuredUnit;
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    const poolDaiBalanceAfter = await dai.balanceOf(pool.address);
    assert.equal(poolDaiBalanceAfter.sub(poolDaiBalanceBefore).toString(), cover.price);
  });

  it('buys multiple covers in a row for member', async function () {
    const { qd, p1: pool } = this.contracts;
    const cover = { ...ethCoverTemplate };
    const member = member1;

    const poolBalanceBefore = toBN(await web3.eth.getBalance(pool.address));

    const coversToBuy = 3;
    let generationTime = parseInt(cover.generationTime);
    for (let i = 0; i < coversToBuy; i++) {
      const newCover = { ...cover, generationTime: (generationTime++).toString() };
      await buyCover({ ...this.contracts, coverData: newCover, coverHolder: member });
    }

    const coverCount = await qd.getCoverLength();
    assert.equal(coverCount.toString(), (coversToBuy + 1).toString());

    const totalSumAssured = await qd.getTotalSumAssured(hex('ETH'));

    const sumAssuredUnit = cover.amount.div(toBN((1e18).toString()));
    const expectedTotalSumAsssured = toBN(sumAssuredUnit).muln(coversToBuy);
    assert.equal(totalSumAssured.toString(), expectedTotalSumAsssured.toString());

    const poolBalanceAfter = toBN(await web3.eth.getBalance(pool.address));
    assert.equal(poolBalanceAfter.toString(), poolBalanceBefore.add(toBN(cover.price).muln(coversToBuy)).toString());
  });

  it('reverts for non-member', async function () {
    const cover = { ...ethCoverTemplate };
    await expectRevert(
      buyCover({ ...this.contracts, coverData: cover, coverHolder: nonMember1 }),
      'Caller is not a member',
    );
  });

  it('reverts if cover period < 30', async function () {
    const cover = { ...ethCoverTemplate, period: 29 };
    await expectRevert(
      buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 }),
      'Quotation: Cover period out of bounds',
    );
  });

  it('reverts if cover period > 365', async function () {
    const cover = { ...ethCoverTemplate, period: 366 };
    await expectRevert(
      buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 }),
      'Quotation: Cover period out of bounds',
    );
  });

  it('reverts if msg.value does not match cover premium', async function () {
    const { gateway, qt } = this.contracts;

    const coverHolder = member1;
    const coverData = { ...ethCoverTemplate, amount: ether('10') };
    const price = toBN(coverData.price);

    const data = await getBuyCoverDataParameter({ qt, coverData });
    await expectRevert(
      gateway.buyCover(
        coverData.contractAddress,
        coverData.asset,
        coverData.amount,
        coverData.period,
        coverData.type,
        data,
        {
          from: coverHolder,
          value: price.subn(1),
        },
      ),
      'Gateway: ETH amount does not match premium',
    );
  });

  it('reverts if approved DAI amount is not sufficient for premium', async function () {
    const { gateway, qt, dai } = this.contracts;

    const coverHolder = member1;
    const coverData = { ...daiCoverTemplate };
    const price = toBN(coverData.price);

    await dai.approve(gateway.address, price.subn(1), {
      from: coverHolder,
    });

    const data = await getBuyCoverDataParameter({ qt, coverData });
    await expectRevert(
      gateway.buyCover(
        coverData.contractAddress,
        dai.address,
        coverData.amount,
        coverData.period,
        coverData.type,
        data,
        { from: coverHolder },
      ),
      'SafeERC20: low-level call failed',
    );
  });

  it('revers if ETH amount is not whole unit', async function () {
    const { gateway, qt } = this.contracts;

    const coverHolder = member1;
    const coverData = { ...ethCoverTemplate, amount: ether('10').addn(1) };
    const price = toBN(coverData.price);

    const data = await getBuyCoverDataParameter({ qt, coverData });
    await expectRevert(
      gateway.buyCover(
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
      ),
      'Gateway: Only whole unit sumAssured supported',
    );
  });

  it('reverts if smart contract address is the 0 address', async function () {
    const cover = { ...ethCoverTemplate, contractAddress: '0x0000000000000000000000000000000000000000' };
    await expectRevert.unspecified(buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 }));
  });

  it('reverts if quote validity is expired', async function () {
    const currentTime = await time.latest();
    const cover = { ...ethCoverTemplate, expireTime: currentTime.subn(2) };
    await expectRevert.unspecified(buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 }));
  });

  it('reverts if quote is reused', async function () {
    const cover = { ...ethCoverTemplate };
    await buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 });
    await expectRevert.unspecified(buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 }));
  });

  it('reverts if NXM premium is 0', async function () {
    const cover = { ...ethCoverTemplate, priceNXM: '0' };
    await expectRevert.unspecified(buyCover({ ...this.contracts, coverData: cover, coverHolder: member1 }));
  });

  it('reverts if signed quote does not match quote parameters', async function () {
    const { qt, gateway } = this.contracts;
    const coverData = { ...ethCoverTemplate };
    const member = member1;

    // sign a different amount than the one requested.
    const [v, r, s] = await getQuoteSignature(
      coverToCoverDetailsArray({ ...coverData, amount: coverData.amount + 1 }),
      coverData.currency,
      coverData.period,
      coverData.contractAddress,
      qt.address,
    );

    const price = toBN(coverData.price);
    const data = web3.eth.abi.encodeParameters(
      ['uint', 'uint', 'uint', 'uint', 'uint8', 'bytes32', 'bytes32'],
      [price, coverData.priceNXM, coverData.expireTime, coverData.generationTime, v, r, s],
    );

    await expectRevert.unspecified(
      gateway.buyCover(
        coverData.contractAddress,
        coverData.asset,
        coverData.amount,
        coverData.period,
        coverData.type,
        data,
        {
          from: member,
          value: coverData.price,
        },
      ),
    );
  });
});
