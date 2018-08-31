const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const NXMTokenData = artifacts.require('NXMTokenData');
const Pool1 = artifacts.require('Pool1');
const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
const member3 = web3.eth.accounts[3];
const nonMember = web3.eth.accounts[9];
const contractAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const { assertRevert } = require('./utils/assertRevert');
const CLA = '0x434c41';

let P1;
let nxmtk1;
let nxmtd;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe('Contract: 04_NXMToken1', function() {
  const LockDays = new BigNumber(30);
  const ExtendLockDays = new BigNumber(10);
  const toSec = new BigNumber(86400);
  const lockTokens = new BigNumber(4e18);
  const extendLockTokens = new BigNumber(4);
  const P_18 = new BigNumber(1e18);
  const tokensToTransfer = new BigNumber(6e16);
  const allowanceTokens = new BigNumber(8e17);
  const spendAllowanceTokens = new BigNumber(5e17);
  const stakeTokens = new BigNumber(1e18);

  before(function() {
    NXMToken1.deployed()
      .then(function(instance) {
        nxmtk1 = instance;
        return NXMToken2.deployed();
      })
      .then(function(instance) {
        nxmtk2 = instance;
        return NXMTokenData.deployed();
      })
      .then(function(instance) {
        nxmtd = instance;
        return Pool1.deployed();
      })
      .then(function(instance) {
        P1 = instance;
      });
  });
  it('should return correct symbol', async function() {
    const symbol = 'NXM';
    symbol.should.equal(await nxmtk1.symbol());
  });
  it('should return non zero total Supply', async function() {
    const ts = await nxmtk1.totalSupply();
    ts.should.be.bignumber.not.equal(new BigNumber(0));
  });
  it('should return correct decimals', async function() {
    const decimals = 18;
    decimals.should.be.bignumber.equal(await nxmtk1.decimals());
  });
  it('should return non-zero AvailableTokens of a member', async function() {
    const tokens = await nxmtk1.getAvailableTokens(member);
    tokens.should.be.bignumber.not.equal(new BigNumber(0));
  });
  it('should return current Founder tokens', async function() {
    await nxmtd.getCurrentFounderTokens();
  });
  it('should return correct minimun vote lock period', async function() {
    const minVoteLockPeriod = new BigNumber(604800);
    minVoteLockPeriod.should.be.bignumber.equal(
      await nxmtd.getMinVoteLockPeriod()
    );
  });
  it('should be able to change minimun vote lock period', async function() {
    const newMinVoteLockPeriod = new BigNumber(704800);
    await nxmtd.changeMinVoteLockPeriod(newMinVoteLockPeriod);
    newMinVoteLockPeriod.should.be.bignumber.equal(
      await nxmtd.getMinVoteLockPeriod()
    );
    await nxmtd.changeMinVoteLockPeriod(new BigNumber(604800));
  });
  it('should be able to change initial Token', async function() {
    await nxmtd.changeIntialTokens(1500000);
  });
  it('should able to lock tokens under Claim Assesment', async function() {
    this.timeout(0);
    let NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const initialLockedTokens = (await nxmtk1.tokensLocked(
      member,
      CLA,
      NOW
    )).div(P_18);
    const initialTokenBalance = (await nxmtk1.balanceOf(member)).div(P_18);
    initialLockedTokens.should.be.bignumber.equal(new BigNumber(0));
    const validity = NOW.plus(LockDays.times(toSec));
    await nxmtk1.lock(CLA, lockTokens, validity, { from: member });
    const lockedTokens = initialLockedTokens.plus(lockTokens.div(P_18));
    const newTokenBalance = initialTokenBalance.minus(lockTokens.div(P_18));
    newTokenBalance.should.be.bignumber.equal(
      (await nxmtk1.balanceOf(member)).div(P_18)
    );
    NOW = new BigNumber(Math.floor(Date.now() / 1000));
    lockedTokens.should.be.bignumber.equal(
      (await nxmtk1.tokensLocked(member, CLA, NOW)).div(P_18)
    );
  });

  it('should able to extend validity of tokens for Claim Assesment', async function() {
    let NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const initialLockedTokens = (await nxmtk1.tokensLocked(
      member,
      CLA,
      NOW
    )).div(P_18);
    initialLockedTokens.should.be.bignumber.not.equal(new BigNumber(0));
    const initialValidity = (await nxmtd.locked(member, CLA))[0];
    await nxmtk1.extendLock(CLA, ExtendLockDays.times(toSec), { from: member });
    const newValidity = initialValidity.plus(ExtendLockDays.times(toSec));
    newValidity.should.be.bignumber.equal((await nxmtd.locked(member, CLA))[0]);
  });

  it('should able to extend amount of tokens for Claim Assesment', async function() {
    let NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const initialLockedTokens = (await nxmtk1.tokensLocked(
      member,
      CLA,
      NOW
    )).div(P_18);
    initialLockedTokens.should.be.bignumber.not.equal(new BigNumber(0));
    const initialTokenBalance = (await nxmtk1.balanceOf(member)).div(P_18);
    await nxmtk1.increaseLockAmount(CLA, extendLockTokens.times(P_18), {
      from: member
    });
    const newTokenBalance = initialTokenBalance.minus(extendLockTokens);
    NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const newLockedTokens = initialLockedTokens.plus(extendLockTokens);
    newLockedTokens.should.be.bignumber.equal(
      (await nxmtk1.tokensLocked(member, CLA, NOW)).div(P_18)
    );
    newTokenBalance.should.be.bignumber.equal(
      (await nxmtk1.balanceOf(member)).div(P_18)
    );
  });

  it('should able to transfer tokens to any other member', async function() {
    const initialTokenOfMember = await nxmtk1.balanceOf(member);
    const initialTokenOfReceiver = await nxmtk1.balanceOf(receiver);
    await nxmtk1.transfer(receiver, tokensToTransfer, { from: member });
    const presentTokenOfMember = initialTokenOfMember.minus(tokensToTransfer);
    const presentTokenOfReceiver = initialTokenOfReceiver.plus(
      tokensToTransfer
    );
    presentTokenOfMember.should.be.bignumber.equal(
      await nxmtk1.balanceOf(member)
    );
    presentTokenOfReceiver.should.be.bignumber.equal(
      await nxmtk1.balanceOf(receiver)
    );
  });

  it('should able to stake NXMs on Smart Contracts', async function() {
    const initialTokenBalance = await nxmtk1.balanceOf(member);
    const initialStakedTokens = await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(
      member,
      contractAdd
    );
    initialStakedTokens.should.be.bignumber.equal(new BigNumber(0));
    await nxmtk2.addStake(contractAdd, stakeTokens, { from: member });
    const newTokenBalance = initialTokenBalance.minus(stakeTokens);
    const newStakedTokens = initialStakedTokens.plus(stakeTokens);
    newTokenBalance.should.be.bignumber.equal(await nxmtk1.balanceOf(member));
    newStakedTokens.should.be.bignumber.equal(
      await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(member, contractAdd)
    );
  });

  it('should able to allows a Member(Spender) to spend a given amount of the money on behalf of another Member', async function() {
    await nxmtk1.approve(receiver, allowanceTokens, { from: member });
    allowanceTokens.should.be.bignumber.equal(
      await nxmtd.getAllowerSpenderAllowance(member, receiver)
    );
  });

  it('should able to transfer on behalf of the other user', async function() {
    const allowanceTokens = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    const initialTokensOfReceiver = await nxmtk1.balanceOf(receiver);
    const initialTokenOfMember = await nxmtk1.balanceOf(member);
    await nxmtk1.transferFrom(member, receiver, spendAllowanceTokens, {
      from: receiver
    });
    const currentAllowanceTokens = allowanceTokens.minus(spendAllowanceTokens);
    const currentTokensOfReceiver = initialTokensOfReceiver.plus(
      spendAllowanceTokens
    );
    const currentTokensOfMember = initialTokenOfMember.minus(
      spendAllowanceTokens
    );
    currentAllowanceTokens.should.be.bignumber.equal(
      await nxmtd.getAllowerSpenderAllowance(member, receiver)
    );
    currentTokensOfReceiver.should.be.bignumber.equal(
      await nxmtk1.balanceOf(receiver)
    );
    currentTokensOfMember.should.be.bignumber.equal(
      await nxmtk1.balanceOf(member)
    );
  });

  it('should not able to exceed transfer on behalf of the other user', async function() {
    const allowanceTokens = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    const initialTokensOfReceiver = await nxmtk1.balanceOf(receiver);
    const initialTokenOfMember = await nxmtk1.balanceOf(member);
    await assertRevert(
      nxmtk1.transferFrom(member, receiver, spendAllowanceTokens, {
        from: receiver
      })
    );
    const currentAllowanceTokens = allowanceTokens;
    const currentTokensOfReceiver = initialTokensOfReceiver;
    const currentTokensOfMember = initialTokenOfMember;
    currentAllowanceTokens.should.be.bignumber.equal(
      await nxmtd.getAllowerSpenderAllowance(member, receiver)
    );
    currentTokensOfReceiver.should.be.bignumber.equal(
      await nxmtk1.balanceOf(receiver)
    );
    currentTokensOfMember.should.be.bignumber.equal(
      await nxmtk1.balanceOf(member)
    );
  });

  it('should have zero token balance for Non-Member', async function() {
    const tokensOfNonMember = await nxmtk1.balanceOf(nonMember);
    tokensOfNonMember.should.be.bignumber.equal(new BigNumber(0));
  });

  it('should not able to purchase NXM Tokens if not a memberr', async function() {
    await assertRevert(P1.buyTokenBegin({ from: nonMember, value: 1000 }));
    const tokensOfNonMember = await nxmtk1.balanceOf(nonMember);
    tokensOfNonMember.should.be.bignumber.equal(new BigNumber(0));
  });

  it('should not able to transfer Tokens to Non-Member', async function() {
    const initialTokenMember = await nxmtk1.balanceOf(member);
    const initialTokenOfNonMember = await nxmtk1.balanceOf(nonMember);
    await assertRevert(nxmtk1.transfer(nonMember, tokensToTransfer));
    const presentTokenMember = await nxmtk1.balanceOf(member);
    const presentTokenOfNonMember = await nxmtk1.balanceOf(nonMember);
    presentTokenMember.should.be.bignumber.equal(initialTokenMember);
    presentTokenOfNonMember.should.be.bignumber.equal(initialTokenOfNonMember);
  });

  it('should not able to lock Tokens under CA more than once', async function() {
    const NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const validity = NOW.plus(LockDays.times(toSec));
    const LockedTokens = await nxmtk1.tokensLocked(member, CLA, NOW);
    await assertRevert(nxmtk1.lock(CLA, 5000, validity));
    LockedTokens.should.be.bignumber.equal(
      await nxmtk1.tokensLocked(member, CLA, NOW)
    );
  });

  it('should not able to transfer locked Tokens', async function() {
    const totalTokens = await nxmtd.getBalanceOf(member);
    await assertRevert(
      nxmtk1.transfer(receiver, totalTokens, { from: member })
    );
  });
});
