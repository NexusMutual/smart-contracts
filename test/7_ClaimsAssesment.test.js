const NXMToken1 = artifacts.require('NXMToken1');
const NXMTokenData = artifacts.require('NXMTokenData');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const QuotationData = artifacts.require('QuotationData');
const PoolData = artifacts.require('PoolData');
const Pool1 = artifacts.require('Pool1');
const MCR = artifacts.require('MCR');
const member1 = web3.eth.accounts[1];
const member2 = web3.eth.accounts[2];
const member3 = web3.eth.accounts[3];
const coverHolder = web3.eth.accounts[4];
const nonMember = web3.eth.accounts[9];
const validity = 31 * 3600 * 24;
let blockNumber = web3.eth.blockNumber;
const timeStamp = web3.eth.getBlock(blockNumber).timestamp;
const CLA = '0x434c41';
let P1;
let nxmtk1;
let cl;
let td;
let qd;
let cd;
let pd;
let mcr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

const increaseTime = function(duration) {
  web3.currentProvider.sendAsync(
    {
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [duration],
      id: timeStamp
    },
    (err, resp) => {
      if (!err) {
        web3.currentProvider.send({
          jsonrpc: '2.0',
          method: 'evm_mine',
          params: [],
          id: timeStamp + 1
        });
      }
    }
  );
};

describe('Contract: 07_claimsAssesment', function() {
  const Amt = new BigNumber(13e18);
  const P_18 = new BigNumber(1e18);
  before(function() {
    NXMTokenData.deployed()
      .then(function(instance) {
        td = instance;
        return QuotationData.deployed();
      })
      .then(function(instance) {
        qd = instance;
        return Claims.deployed();
      })
      .then(function(instance) {
        cl = instance;
        return ClaimsData.deployed();
      })
      .then(function(instance) {
        cd = instance;
        return MCR.deployed();
      })
      .then(function(instance) {
        mcr = instance;
        return Pool1.deployed();
      })
      .then(function(instance) {
        P1 = instance;
        return NXMToken1.deployed();
      })
      .then(function(instance) {
        nxmtk1 = instance;
      });
  });

  it('should able to submit vote for claim assesment', async function() {
    this.timeout(0);
    let maxVotingTime = await cd.maxVotingTime();
    blockNumber = web3.eth.blockNumber;
    const newLockTimestamp = web3.eth.getBlock(blockNumber).timestamp;
    let closingTime = newLockTimestamp + maxVotingTime.toNumber();
    let price = await mcr.calculateTokenPrice('ETH');
    console.log('tkp=>', price.div(P_18).toNumber());
    await P1.buyTokenBegin({ from: member2, value: Amt });
    await P1.buyTokenBegin({ from: member3, value: Amt });
    const tkp = await mcr.calculateTokenPrice('ETH');
    console.log('tkp=>', tkp.div(P_18).toNumber());
    const tokens = Amt.div(tkp).times(P_18);
    console.log('tokens:', tokens.toNumber());
    await nxmtk1.lock(CLA, tokens, validity, { from: member2 });
    await nxmtk1.lock(CLA, tokens, validity, { from: member3 });
    let NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const LockedTokens = (await nxmtk1.tokensLocked(member2, CLA, NOW)).div(
      P_18
    );
    const LockedTokens1 = (await nxmtk1.tokensLocked(member3, CLA, NOW)).div(
      P_18
    );
    console.log('member3 locked:', LockedTokens1.toNumber());
    console.log('member2 locked:', LockedTokens.toNumber());
    const initialBookedCaM2 = await td.getBookedCA(member2);
    const initialBookedCaM3 = await td.getBookedCA(member3);
    let checkNotVoted = false;
    if (
      (await cd.getUserClaimVoteCA(member2, 1)) == 0 &&
      (await cd.getUserClaimVoteCA(member3, 1)) == 0
    )
      checkNotVoted = true;
    checkNotVoted.should.equal(true);
    let claimDepositTime = await cd.claimDepositTime();
    claimDepositTime = claimDepositTime.plus(NOW);
    let closeVoting = await cl.checkVoteClosing(1);
    closeVoting.should.not.equal(1);
    let tokensForVotingM3 = await td.tokensLocked(
      member3,
      CLA,
      claimDepositTime
    );
    const bookedTokensM3 = await td.getBookedCA(member3);
    tokensForVotingM3 = tokensForVotingM3.minus(bookedTokensM3);
    tokensForVotingM3.should.be.bignumber.above(new BigNumber(0));
    const initialLockedValidityM3 = await td.locked(member3, CLA);
    const initialLockedValidityM2 = await td.locked(member2, CLA);
    await cl.submitCAVote(1, -1, { from: member3 });
    let tokensForVotingM2 = await td.tokensLocked(
      member2,
      CLA,
      claimDepositTime
    );
    const bookedTokensM2 = await td.getBookedCA(member2);
    tokensForVotingM2 = tokensForVotingM2.minus(bookedTokensM2);
    console.log('tokensForVotingM2', tokensForVotingM2);
    tokensForVotingM2.should.be.bignumber.above(new BigNumber(0));
    await cl.submitCAVote(1, -1, { from: member2 });
    const presentBookedCaM3 = await td.getBookedCA(member3);
    const presentBookedCaM2 = await td.getBookedCA(member2);
    const presentLockedValidityM3 = await td.locked(member3, CLA);
    const presentLockedValidityM2 = await td.locked(member2, CLA);
    const newBookedCaM2 = initialBookedCaM2.plus(tokensForVotingM2);
    const newBookedCaM3 = initialBookedCaM3.plus(tokensForVotingM3);
    const lockDays = await td.lockCADays();
    const newLockedValidityM3 = initialLockedValidityM3[0].plus(
      new BigNumber(lockDays)
    );
    const newLockedValidityM2 = initialLockedValidityM2[0].plus(
      new BigNumber(lockDays)
    );
    const voteDetailsM3 = await cd.getVoteDetails(1);
    const voteDetailsM2 = await cd.getVoteDetails(2);
    voteDetailsM3[0].should.be.bignumber.equal(tokensForVotingM3);
    voteDetailsM3[1].should.be.bignumber.equal(1);
    voteDetailsM3[2].should.be.bignumber.equal(-1);
    voteDetailsM3[3].should.equal(false);
    voteDetailsM2[0].should.be.bignumber.equal(tokensForVotingM2);
    voteDetailsM2[1].should.be.bignumber.equal(1);
    voteDetailsM2[2].should.be.bignumber.equal(-1);
    voteDetailsM2[3].should.equal(false);
    newBookedCaM3.should.be.bignumber.equal(presentBookedCaM3);
    newBookedCaM2.should.be.bignumber.equal(presentBookedCaM2);
    newLockedValidityM3.should.be.bignumber.equal(presentLockedValidityM3[0]);
    newLockedValidityM2.should.be.bignumber.equal(presentLockedValidityM2[0]);
    await increaseTime(closingTime);
    closeVoting = await cl.checkVoteClosing(1);
    console.log('closeVoting:', closeVoting.toNumber());
    closeVoting.should.be.bignumber.equal(new BigNumber(1));
  });

  // it('should return correct vote details',async function(){

  // });
});
