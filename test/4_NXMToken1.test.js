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
  const tokensToTransfer = new BigNumber(9e17);
  const allowanceTokens = new BigNumber(8e17);
  const spendAllowanceTokens = new BigNumber(5e17);
  const stakeTokens = new BigNumber(6e18);

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
    const newTokenBalance = initialTokenBalance.minus(extendLockTokens); //await nxmtk1.balanceOf(member);
    NOW = new BigNumber(Math.floor(Date.now() / 1000));
    const newLockedTokens = initialLockedTokens.plus(extendLockTokens); //(await nxmtk1.tokensLocked(member, CLA, NOW)).div(P_18);
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
    const presentTokenOfMember = initialTokenOfMember.minus(tokensToTransfer); //await nxmtk1.balanceOf(member);
    const presentTokenOfReceiver = initialTokenOfReceiver.plus(
      tokensToTransfer
    ); //await nxmtk1.balanceOf(receiver);
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
    const newTokenBalance = initialTokenBalance.minus(stakeTokens); //await nxmtk1.balanceOf(member);
    const newStakedTokens = initialStakedTokens.plus(stakeTokens); //await nxmtd.getTotalStakedAmtByStakerAgainstScAddress( member,contractAdd);
    newTokenBalance.should.be.bignumber.equal(await nxmtk1.balanceOf(member));
    newStakedTokens.should.be.bignumber.equal(
      await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(member, contractAdd)
    );
  });

  /*  it('should able to allows a Member(Spender) to spend a given amount of the money on behalf of another Member', async function() {
    this.timeout(0);
    let setAllowance = await nxmtk1.approve(receiver, allowanceTokens, {
      from: member
    });
    let verifyAllowance = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    verifyAllowance.should.be.bignumber.equal(allowanceTokens);
  });

  it('should able to transfer on behalf of the other user', async function() {
    this.timeout(0);
    let allowanceTokens = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    let initialTokensOfReceiver = await nxmtk1.balanceOf(receiver);
    let initialTokenOfSpender = await nxmtk1.balanceOf(member);
    await nxmtk1.transferFrom(member, receiver, spendAllowanceTokens, {
      from: receiver
    });
    let remainedAllowanceTokens = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    let currentTokensOfReceiver = await nxmtk1.balanceOf(receiver);
    let currentTokensOfSpender = await nxmtk1.balanceOf(member);
    remainedAllowanceTokens.should.be.bignumber.equal(
      allowanceTokens.minus(spendAllowanceTokens)
    );
    currentTokensOfReceiver.should.be.bignumber.equal(
      initialTokensOfReceiver.plus(spendAllowanceTokens)
    );
    currentTokensOfSpender.should.be.bignumber.equal(
      initialTokenOfSpender.minus(spendAllowanceTokens)
    );
  });

  it('should not able to exceed transfer on behalf of the other user', async function() {
    this.timeout(0);
    let allowanceTokens = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    let initialTokensOfReceiver = await nxmtk1.balanceOf(receiver);
    let initialTokenOfSpender = await nxmtk1.balanceOf(member);
    await assertRevert(
      nxmtk1.transferFrom(member, receiver, spendAllowanceTokens, {
        from: receiver
      })
    );
    let remainedAllowanceTokens = await nxmtd.getAllowerSpenderAllowance(
      member,
      receiver
    );
    let currentTokensOfReceiver = await nxmtk1.balanceOf(receiver);
    let currentTokensOfSpender = await nxmtk1.balanceOf(member);
    remainedAllowanceTokens.should.be.bignumber.equal(allowanceTokens);
    currentTokensOfReceiver.should.be.bignumber.equal(initialTokensOfReceiver);
    currentTokensOfSpender.should.be.bignumber.equal(initialTokenOfSpender);
  });

  it('should have zero token balance for Non-Member', async function() {
    this.timeout(0);
    let tokensOfNonMember = await nxmtk1.balanceOf(nonMember);
    tokensOfNonMember.should.be.bignumber.equal(new BigNumber(0));
  });

  it('should not able to purchase NXM Tokens if not a memberr', async function() {
    this.timeout(0);
    await assertRevert(P1.buyTokenBegin({ from: nonMember, value: Tokens }));
    let tokensOfNonMember = await nxmtk1.balanceOf(nonMember);
    tokensOfNonMember.should.be.bignumber.equal(new BigNumber(0));
  });

  it('should not able to transfer Tokens to Non-Member', async function() {
    this.timeout(0);
    let initialTokenMember = await nxmtk1.balanceOf(member);
    let initialTokenOfNonMember = await nxmtk1.balanceOf(nonMember);
    await assertRevert(nxmtk1.transfer(nonMember, tokensToTransfer));
    let presentTokenMember = await nxmtk1.balanceOf(member);
    let presentTokenOfNonMember = await nxmtk1.balanceOf(nonMember);
    presentTokenMember.should.be.bignumber.equal(initialTokenMember);
    presentTokenOfNonMember.should.be.bignumber.equal(initialTokenOfNonMember);
  });

  it('should not able to lock Tokens under CA more than once', async function() {
    this.timeout(0);
    let NOW = Math.floor(Date.now() / 1000);
    let initialLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
    let validity = NOW + LockDays * 24 * 3600;
    await assertRevert(nxmtk1.lock(CLA, Tokens, validity));
    let currentLocked = await nxmtk1.tokensLocked(member, CLA, NOW);
    currentLocked.should.be.bignumber.equal(initialLocked);
  });

  it('should not able to transfer locked Tokens', async function() {
    this.timeout(0);
    let totalTokens = await nxmtd.getBalanceOf(member);
    await assertRevert(
      nxmtk1.transfer(receiver, totalTokens, { from: member })
    );
  });
*/
});
