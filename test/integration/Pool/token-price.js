const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const Decimal = require('decimal.js');
const { toBN } = web3.utils;

const {
  calculateEthForNXMRelativeError,
  calculateNXMForEthRelativeError,
  calculateMCRRatio,
  getTokenSpotPrice,
} = require('../utils').tokenPrice;

const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { buyCover } = require('../utils').buyCover;
const { hex } = require('../utils').helpers;

const [, member1, member2, member3, member4, member5, coverHolder, nonMember1, payoutAddress] = accounts;

const coverTemplate = {
  amount: 1, // 1 eth
  price: '3000000000000000', // 0.003 eth
  priceNXM: '1000000000000000000', // 1 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xc0ffeec0ffeec0ffeec0ffeec0ffeec0ffee0000',
};

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const ratioScale = toBN(10000);

describe('Token price functions', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);

    await enrollMember(this.contracts, [member4], {
      initialTokens: ether('1000'),
    });

    await enrollMember(this.contracts, [member5], {
      initialTokens: ether('500'),
    });
  });

  it('getTokenPrice returns spot price for all assets', async function () {
    const { p1: pool, dai, pd: poolData, mcr } = this.contracts;
    const { ethToDaiRate } = this.rates;

    const ethTokenPrice = await pool.getTokenPrice(ETH);
    const daiTokenPrice = await pool.getTokenPrice(dai.address);

    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();
    const expectedEthTokenPrice = toBN(getTokenSpotPrice(totalAssetValue, mcrEth).toString());

    const ethPriceDiff = ethTokenPrice.sub(expectedEthTokenPrice).abs();
    assert(
      ethPriceDiff.lte(toBN(1)),
      `token price ${ethTokenPrice.toString()} not close enough to ${expectedEthTokenPrice.toString()}`,
    );

    const expectedDaiPrice = toBN(ethToDaiRate / 100).mul(expectedEthTokenPrice);
    const daiPriceDiff = daiTokenPrice.sub(expectedDaiPrice);
    assert(
      daiPriceDiff.lte(toBN(10000)), // negligible amount of wei
      `DAI token price ${daiTokenPrice.toString()} not close enough to ${expectedDaiPrice.toString()}`,
    );
  });

  it('buyNXM reverts for non-member', async function () {
    const { p1: pool } = this.contracts;

    const buyValue = ether('10');
    await expectRevert(
      pool.buyNXM('0', { from: nonMember1, value: buyValue }),
      'Caller is not a member',
    );
  });

  it('sellNXM reverts for non-member', async function () {
    const { p1: pool } = this.contracts;

    await expectRevert(
      pool.sellNXM('1', '0', { from: nonMember1 }),
      'Caller is not a member',
    );
  });

  it('sellNXM reverts if member does not have enough NXM balance', async function () {
    const { p1: pool, tk: token } = this.contracts;
    const memberBalance = await token.balanceOf(member1);

    await expectRevert(
      pool.sellNXM(memberBalance.addn(1), '0', { from: member1 }),
      'Pool: Not enough balance',
    );
  });

  it('buyNXM mints tokens for member in exchange of ETH', async function () {
    const { tk: token, p1: pool, pd: poolData, mcr } = this.contracts;

    const buyValue = ether('1000');
    const expectedTokensReceived = await pool.getNXMForEth(buyValue);
    const totalAssetValue = await pool.getPoolValueInEth();
    const mcrEth = await mcr.getMCR();

    const member = member1;
    const preBuyBalance = await token.balanceOf(member);
    await pool.buyNXM(expectedTokensReceived, { from: member, value: buyValue });

    const postBuyBalance = await token.balanceOf(member);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    assert.equal(tokensReceived.toString(), expectedTokensReceived.toString());

    const maxRelativeError = new Decimal(0.0006);
    const { relativeError } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokensReceived);
    assert(relativeError.lt(maxRelativeError), `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`);
  });

  it('sellNXM burns tokens for member and returns ETH', async function () {
    const { tk: token, p1: pool } = this.contracts;
    const ethIn = ether('500');
    const nxmAmount = await pool.getNXMForEth(ethIn);

    // buy tokens first
    await pool.buyNXM(nxmAmount, { from: member1, value: ethIn });

    // sell them back
    const preNXMSellBalance = await token.balanceOf(member1);
    const preSellTokenSupply = await token.totalSupply();
    const preSellEthBalance = await web3.eth.getBalance(member1);

    await pool.sellNXM(nxmAmount, '0', { from: member1, gasPrice: 0 });

    const postSellEthBalance = await web3.eth.getBalance(member1);
    const postSellNXMBalance = await token.balanceOf(member1);
    const postSellTokenSupply = await token.totalSupply();

    const tokensTakenAway = preNXMSellBalance.sub(postSellNXMBalance);
    const tokensBurned = preSellTokenSupply.sub(postSellTokenSupply);

    assert(tokensTakenAway.toString(), nxmAmount.toString());
    assert(tokensBurned.toString(), nxmAmount.toString());

    const ethOut = toBN(postSellEthBalance).sub(toBN(preSellEthBalance));

    const maxRelativeError = new Decimal(0.0002);
    const { relativeError } = calculateEthForNXMRelativeError(ethIn, ethOut);

    assert(
      relativeError.lt(maxRelativeError),
      `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`,
    );
  });

  it('buyNXM token price reflects the latest lower MCR value (lower MCReth -> higher price)', async function () {
    const { p1: pool, mcr } = this.contracts;

    const ETH = await pool.ETH();
    const buyValue = ether('1000');
    const expectedNXMOutPreMCRPosting = await pool.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool.getTokenPrice(ETH);
    await pool.getPoolValueInEth();

    // trigger an MCR update and post a lower MCR since lowering the price (higher MCR percentage)
    const minUpdateTime = await mcr.minUpdateTime();
    await time.increase(minUpdateTime.addn(1));

    // perform a buy with a negligible amount of ETH
    const tx = await pool.buyNXM('0', { from: member1, value: '1' });
    // let time pass so that mcr decreases towards desired MCR
    await time.increase(time.duration.hours(6));

    const spotTokenPricePostMCRPosting = await pool.getTokenPrice(ETH);
    const expectedNXMOutPostMCRPosting = await pool.getNXMForEth(buyValue);

    assert(
      spotTokenPricePostMCRPosting.gt(spotTokenPricePreMCRPosting),
      `Expected token price to be higher than ${spotTokenPricePreMCRPosting.toString()} at a lower mcrEth.
       Price: ${spotTokenPricePostMCRPosting.toString()}`,
    );
    assert(
      expectedNXMOutPostMCRPosting.lt(expectedNXMOutPreMCRPosting),
      `Expected to receive less tokens than ${expectedNXMOutPreMCRPosting.toString()} at a lower mcrEth.
       Receiving: ${expectedNXMOutPostMCRPosting.toString()}`,
    );
  });

  it('buyNXM token price reflects the latest higher MCR value (higher MCReth -> lower price)', async function () {
    const { p1: pool, mcr } = this.contracts;

    const ETH = await pool.ETH();
    const buyValue = ether('1000');
    const expectedNXMOutPreMCRPosting = await pool.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool.getTokenPrice(ETH);
    await pool.getPoolValueInEth();

    const gearingFactor = await mcr.gearingFactor();
    const currentMCR = await mcr.getMCR();
    const coverAmount = gearingFactor.mul(currentMCR.add(ether('300'))).div(ether('1')).div(ratioScale);
    const cover = { ...coverTemplate, amount: coverAmount };

    // increase totalSumAssured to trigger MCR increase
    await buyCover({ ...this.contracts, cover, coverHolder });

    // trigger an MCR update and post a lower MCR since lowering the price (higher MCR percentage)
    const minUpdateTime = await mcr.minUpdateTime();
    await time.increase(minUpdateTime.addn(1));

    // perform a buy with a negligible amount of ETH
    await pool.buyNXM('0', { from: member1, value: '1' });
    // let time pass so that mcr increases towards desired MCR
    await time.increase(time.duration.hours(6));

    const spotTokenPricePostMCRPosting = await pool.getTokenPrice(ETH);
    const expectedNXMOutPostMCRPosting = await pool.getNXMForEth(buyValue);

    assert(
      spotTokenPricePostMCRPosting.lt(spotTokenPricePreMCRPosting),
      `Expected token price to be lower than ${spotTokenPricePreMCRPosting.toString()} at a higher mcrEth.
       Price: ${spotTokenPricePostMCRPosting.toString()}`,
    );
    assert(
      expectedNXMOutPostMCRPosting.gt(expectedNXMOutPreMCRPosting),
      `Expected to receive more tokens than ${expectedNXMOutPreMCRPosting.toString()} at a higher mcrEth.
       Receiving: ${expectedNXMOutPostMCRPosting.toString()}`,
    );
  });

  it('getPoolValueInEth calculates pool value correctly', async function () {
    const { p1: pool, dai } = this.contracts;
    const { daiToEthRate } = this.rates;

    const poolBalance = toBN(await web3.eth.getBalance(pool.address));
    const daiBalance = await dai.balanceOf(pool.address);
    const expectedDAiValueInEth = daiToEthRate.mul(daiBalance).div(ether('1'));
    const expectedTotalAssetValue = poolBalance.add(expectedDAiValueInEth);
    const totalAssetValue = await pool.getPoolValueInEth();
    assert(totalAssetValue.toString(), expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const { p1: pool } = this.contracts;
    const mcrRatio = await pool.getMCRRatio();
    assert.equal(mcrRatio.toString(), '20000');
  });

  it('sellNXM reverts for member if tokens are locked for member vote', async function () {
    const { cd: claimsData, cl: claims, qd: quotationData, p1: pool, tk: token, master, cr } = this.contracts;
    const cover = { ...coverTemplate };
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);

    const buyValue = ether('1000');
    await pool.buyNXM('0', { from: member1, value: buyValue });
    const boughtTokenAmount = await token.balanceOf(member1);

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await quotationData.getAllCoversOfUser(coverHolder);
    await claims.submitClaim(coverId, { from: coverHolder });
    const claimId = (await claimsData.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await claims.submitCAVote(claimId, '1', { from: member1 });
    await claims.submitCAVote(claimId, toBN('-1'), { from: member2 });
    await claims.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await claimsData.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await cr.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await claims.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await claimsData.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );

    await claims.submitMemberVote(claimId, '1', { from: member1 });
    await expectRevert(
      pool.sellNXM(boughtTokenAmount, '0', { from: member1 }),
      'Pool: NXM tokens are locked for voting',
    );
    await time.increase(maxVotingTime.addn(1));
    await cr.closeClaim(claimId);
  });

  it('computes token price correctly to decide sum of locked tokens value > 10 * sumAssured and close vote immediately', async function () {
    const { cd, cl, qd, mr, master, p1, dai, cr } = this.contracts;

    const coverUnitAmount = 28;
    const coverAmount = ether(coverUnitAmount.toString());
    const cover = { ...coverTemplate, amount: coverUnitAmount };

    const lockTokens = ether('1000');
    await enrollClaimAssessor(this.contracts, [member1, member2, member3], { lockTokens });

    const tokenPrice = await p1.getTokenPrice(ETH);
    assert(tokenPrice.mul(lockTokens).div(toBN(1e18.toString())).lt(coverAmount.muln(10)));
    assert(tokenPrice.mul(lockTokens).div(toBN(1e18.toString())).muln(2).gt(coverAmount.muln(10)));

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    const minVotingTime = await cd.minVotingTime();
    await time.increase(minVotingTime.addn(1));
    /*
      tokenPrice * lockTokens / 1e18 < coverAmount * 10
      Therefore 1 CA vote is not sufficient.
     */
    await cl.submitCAVote(claimId, '1', { from: member1 });

    const voteStatusBeforeMaxVotingTime = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusBeforeMaxVotingTime.toString(), '0', 'voting should not be closing');

    /*
      2 * tokenPrice * lockTokens / 1e18 < coverAmount * 10
      Therefore 2 CA votes are sufficient.
    */
    await cl.submitCAVote(claimId, '1', { from: member2 });

    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusAfter.toString(), toBN('-1'), 'voting should be closed');

    await cr.closeClaim(claimId); // trigger changeClaimStatus
    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 14,
      'claim status should be 14 (payout done)',
    );
  });

  it('computes token price correctly to decide sum of locked tokens value > 5 * sumAssured and value < 10 * sumAssured for CA vote and allow closing after maxVotingTime', async function () {
    const { cd, cl, qd, mr, master, p1, dai, cr } = this.contracts;

    const coverUnitAmount = 28;
    const coverAmount = ether(coverUnitAmount.toString());
    const cover = { ...coverTemplate, amount: coverUnitAmount };

    const lockTokens = ether('1000');
    await enrollClaimAssessor(this.contracts, [member1, member2, member3], { lockTokens });

    const tokenPrice = await p1.getTokenPrice(ETH);
    assert(
      tokenPrice.mul(lockTokens).div(toBN(1e18.toString())).gt(coverAmount.muln(5)),
      'CA lockedTokens < 5 * sumAssured',
    );
    assert(
      tokenPrice.mul(lockTokens).div(toBN(1e18.toString())).lt(coverAmount.muln(10)),
      'CA lockedTokens < 10 * sumAssured',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    /*
      tokenPrice * lockTokens / 1e18 > coverAmount * 5
      Therefore 1 CA vote is sufficient to accept and payout a claim if maxVotingTime passed.
     */
    await cl.submitCAVote(claimId, '1', { from: member1 });
    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusAfter.toString(), '1', 'voting should be closing');
    await cr.closeClaim(claimId); // trigger changeClaimStatus

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 14,
      'claim status should be 14 (payout done)',
    );
  });

  it('computes token price correctly to decide sum of locked tokens value < 5 * sumAssured for CA vote and go to member vote', async function () {
    const { cd, cl, qd, mr, master, p1, dai, cr } = this.contracts;

    const coverUnitAmount = 28;
    const coverAmount = ether(coverUnitAmount.toString());
    const cover = { ...coverTemplate, amount: coverUnitAmount };

    const lockTokens = ether('500');
    await enrollClaimAssessor(this.contracts, [member1, member2, member3], { lockTokens });

    const tokenPrice = await p1.getTokenPrice(ETH);
    assert(
      tokenPrice.mul(lockTokens).div(toBN(1e18.toString())).lt(coverAmount.muln(5)),
      'CA lockedTokens > 5 * sumAssured',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    /*
      tokenPrice * lockTokens / 1e18 < coverAmount * 5
      Therefore 1 CA vote is insufficient to accept and payout a claim if maxVotingTime passed.
     */
    await cl.submitCAVote(claimId, '1', { from: member1 });
    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert.equal(voteStatusAfter.toString(), '1', 'voting should be closing');
    await cr.closeClaim(claimId); // trigger changeClaimStatus

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 2,
      'claim status should be 2 (CA Vote Threshold not Reached Accept, Pending Member Vote)',
    );
  });

  it('computes token price correctly to decide sum of locked tokens value > 5 * sumAssured for MV vote', async function () {

    const { cd, cl, qd, mr, master, p1, tk, cr } = this.contracts;
    const coverUnitAmount = 28;
    const coverAmount = ether(coverUnitAmount.toString());
    const cover = { ...coverTemplate, amount: coverUnitAmount };

    const lockTokens = ether('1000');
    await enrollClaimAssessor(this.contracts, [member1, member2, member3], { lockTokens });

    const tokenPrice = await p1.getTokenPrice(ETH);
    const memberBalance = await tk.balanceOf(member4);
    assert(
      tokenPrice.mul(memberBalance).div(toBN(1e18.toString())).gt(coverAmount.muln(5)),
      'Balance of member < 5 * sumAssured',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await cl.submitCAVote(claimId, '1', { from: member1 });
    await cl.submitCAVote(claimId, toBN('-1'), { from: member2 });
    await cl.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await cr.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );
    /*
      1 member vote from member 4 ( balance 1000 NXM) is sufficient to exceed sumAssured * 5
      and reject the claim
     */
    await cl.submitMemberVote(claimId, toBN('-1'), { from: member4 });
    await time.increase(maxVotingTime.addn(1));
    await cr.closeClaim(claimId);

    const { statno: claimStatusMV } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusMV.toNumber(), 9,
      'claim status should be 9 (ca consensus not reached, mv rejected)',
    );
  });

  it('computes token price correctly to decide sum of locked tokens value < 5 * sumAssured for MV vote', async function () {

    const { cd, cl, qd, mr, master, p1, tk, cr } = this.contracts;
    const coverUnitAmount = 28;
    const coverAmount = ether(coverUnitAmount.toString());
    const cover = { ...coverTemplate, amount: coverUnitAmount };

    const lockTokens = ether('1000');
    await enrollClaimAssessor(this.contracts, [member1, member2, member3], { lockTokens });

    const tokenPrice = await p1.getTokenPrice(ETH);
    const memberBalance = await tk.balanceOf(member5);
    assert(
      tokenPrice.mul(memberBalance).div(toBN(1e18.toString())).lt(coverAmount.muln(5)),
      'Balance of member > 5 * sumAssured',
    );

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await qd.getAllCoversOfUser(coverHolder);
    await cl.submitClaim(coverId, { from: coverHolder });
    const claimId = (await cd.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await cl.submitCAVote(claimId, '1', { from: member1 });
    await cl.submitCAVote(claimId, toBN('-1'), { from: member2 });
    await cl.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await cd.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await cr.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await cl.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );
    /*
      1 member vote from member 4 ( balance 500 NXM) is insufficient to exceed sumAssured * 5
      and will not be able to reject the claim
     */
    await cl.submitMemberVote(claimId, toBN('-1'), { from: member5 });
    await time.increase(maxVotingTime.addn(1));
    await cr.closeClaim(claimId);

    const { statno: claimStatusMV } = await cd.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusMV.toNumber(), 14,
      'claim status should be 14 (payout done)',
    );
  });
});
