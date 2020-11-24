const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const Decimal = require('decimal.js');
const { toBN } = web3.utils;

const {
  calculateEthForNXMRelativeError,
  calculateNXMForEthRelativeError,
  calculateMCRRatio,
} = require('../utils').tokenPrice;

const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { buyCover } = require('../utils/buyCover');
const { hex } = require('../utils').helpers;

const [, member1, member2, member3, coverHolder, nonMember1] = accounts;

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

describe('Token price functions', function () {

  beforeEach(async function () {
    await enrollMember(this.contracts, [member1, member2, member3, coverHolder]);
  });

  it('buyNXM reverts for non-member', async function () {
    const { p1: pool1 } = this.contracts;

    const buyValue = ether('10');
    await expectRevert(
      pool1.buyNXM('0', { from: nonMember1, value: buyValue }),
      'Not member',
    );
  });

  it('sellNXM reverts for non-member', async function () {
    const { p1: pool1 } = this.contracts;

    await expectRevert(
      pool1.sellNXM('1', '0', { from: nonMember1 }),
      'Not member',
    );
  });

  it('sellNXM reverts if member does not have enough NXM balance', async function () {
    const { p1: pool1, tk: token } = this.contracts;
    const memberBalance = await token.balanceOf(member1);

    await expectRevert(
      pool1.sellNXM(memberBalance.addn(1), '0', { from: member1 }),
      'Pool: Not enough balance',
    );
  });

  it('sellNXM reverts for member if tokens are locked for member vote', async function () {
    const { cd: claimsData, cl: claims, qd: quotationData, p1: pool1, tk: token, master } = this.contracts;
    const cover = { ...coverTemplate };
    await enrollClaimAssessor(this.contracts, [member1, member2, member3]);

    const buyValue = ether('1000');
    await pool1.buyNXM('0', { from: member1, value: buyValue });
    const boughtTokenAmount = await token.balanceOf(member1);

    await buyCover({ ...this.contracts, cover, coverHolder });
    const [coverId] = await quotationData.getAllCoversOfUser(coverHolder);
    await claims.submitClaim(coverId, { from: coverHolder });
    const claimId = (await claimsData.actualClaimLength()).subn(1);

    // create a consensus not reached situation, 66% accept vs 33% deny
    await claims.submitCAVote(claimId, '1', { from: member1 });
    await claims.submitCAVote(claimId, '-1', { from: member2 });
    await claims.submitCAVote(claimId, '1', { from: member3 });

    const maxVotingTime = await claimsData.maxVotingTime();
    await time.increase(maxVotingTime.addn(1));

    await master.closeClaim(claimId); // trigger changeClaimStatus
    const voteStatusAfter = await claims.checkVoteClosing(claimId);
    assert(voteStatusAfter.eqn(0), 'voting should not be closed');

    const { statno: claimStatusCA } = await claimsData.getClaimStatusNumber(claimId);
    assert.strictEqual(
      claimStatusCA.toNumber(), 4,
      'claim status should be 4 (ca consensus not reached, pending mv)',
    );

    await claims.submitMemberVote(claimId, '1', { from: member1 });
    await expectRevert(
      pool1.sellNXM(boughtTokenAmount, '0', { from: member1 }),
      'Pool: NXM tokens are locked for voting',
    );
    await time.increase(maxVotingTime.addn(1));
    await master.closeClaim(claimId);
  });

  it('buyNXM mints tokens for member in exchange of ETH', async function () {
    const { tk: token, p1: pool1, pd: poolData } = this.contracts;

    const buyValue = ether('1000');
    const expectedTokensReceived = await pool1.getNXMForEth(buyValue);
    const totalAssetValue = await pool1.getPoolValueInEth();
    const mcrEth = await poolData.getLastMCREther();

    const member = member1;
    const preBuyBalance = await token.balanceOf(member);
    await pool1.buyNXM(expectedTokensReceived, { from: member, value: buyValue });
    const postBuyBalance = await token.balanceOf(member);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    assert.equal(tokensReceived.toString(), expectedTokensReceived.toString());

    const maxRelativeError = new Decimal(0.0006);
    const { relativeError } = calculateNXMForEthRelativeError(totalAssetValue, buyValue, mcrEth, tokensReceived);
    assert(relativeError.lt(maxRelativeError), `Relative error too high ${relativeError.toString()} > ${maxRelativeError.toFixed()}`);
  });

  it('sellNXM burns tokens for member and returns ETH', async function () {
    const { tk: token, p1: pool1 } = this.contracts;
    const ethIn = ether('500');
    const nxmAmount = await pool1.getNXMForEth(ethIn);

    // buy tokens first
    await pool1.buyNXM(nxmAmount, { from: member1, value: ethIn });

    // sell them back
    const preNXMSellBalance = await token.balanceOf(member1);
    const preSellTokenSupply = await token.totalSupply();
    const preSellEthBalance = await web3.eth.getBalance(member1);

    await pool1.sellNXM(nxmAmount, '0', { from: member1, gasPrice: 0 });

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

  it('buyNXM token price reflects the latest MCR posting (higher MCReth -> lower price)', async function () {
    const { p1: pool1, mcr, pd } = this.contracts;
    const { ethEthRate, ethToDaiRate } = this.rates;

    const buyValue = ether('1000');
    const expectedNXMOutPreMCRPosting = await pool1.getNXMForEth(buyValue);
    const spotTokenPricePreMCRPosting = await pool1.getTokenPrice(hex('ETH'));
    const currentPoolValue = await pool1.getPoolValueInEth();

    // post a higher MCR raising the price
    const lastMCREther = await pd.getLastMCREther();
    const latestMCReth = lastMCREther.add(ether('2'));
    const latestMCRRatio = calculateMCRRatio(currentPoolValue, latestMCReth);

    // add new mcr
    await mcr.addMCRData(
      latestMCRRatio,
      latestMCReth,
      currentPoolValue,
      [hex('ETH'), hex('DAI')],
      [ethEthRate, ethToDaiRate],
      20200103,
    );

    const spotTokenPricePostMCRPosting = await pool1.getTokenPrice(hex('ETH'));
    const expectedNXMOutPostMCRPosting = await pool1.getNXMForEth(buyValue);

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
    const { p1: pool1, dai } = this.contracts;
    const { daiToEthRate } = this.rates;

    const pool1Balance = toBN(await web3.eth.getBalance(pool1.address));
    const daiBalance = await dai.balanceOf(pool1.address);
    const expectedDAiValueInEth = daiToEthRate.mul(daiBalance).div(ether('1'));
    const expectedTotalAssetValue = pool1Balance.add(expectedDAiValueInEth);
    const totalAssetValue = await pool1.getPoolValueInEth();
    assert(totalAssetValue.toString(), expectedTotalAssetValue.toString());
  });

  it('getMCRRatio calculates MCR ratio correctly', async function () {
    const { p1: pool1 } = this.contracts;
    const mcrRatio = await pool1.getMCRRatio();
    assert.equal(mcrRatio.toString(), '21333');
  });
});
