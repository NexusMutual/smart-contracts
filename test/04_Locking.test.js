const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenData');
const Pool1 = artifacts.require('Pool1');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const expectEvent = require('./utils/expectEvent');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

// const ETH = '0x455448';
const CLA = '0x434c41';

let tk;
let tf;
let tc;
let td;
let P1;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Locking', function([owner, member1, member2, member3]) {
  const fee = ether(0.002);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.deployed();
    td = await TokenData.deployed();
    await tf.payJoiningFee(member1, { from: member1, value: fee });
    await tf.kycVerdict(member1, true);
    await P1.buyToken({ from: member1, value: ether(1) });
    await tf.payJoiningFee(member2, { from: member2, value: fee });
    await tf.kycVerdict(member2, true);
    await P1.buyToken({ from: member2, value: ether(1) });
  });
  describe('Lock Tokens', function() {
    const lockTokens = ether(1);
    const validity = duration.days(30);
    const extendLockTokens = ether(2);
    describe('Lock Tokens under Claim Assesment', function() {
      let initialLockedTokens;
      let initialTokenBalance;
      //let eventlogs;
      it('should have zero initialLockedTokens', async function() {
        initialLockedTokens = await tc.tokensLocked(member1, CLA);
        initialTokenBalance = await tk.balanceOf(member1);
        await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
        initialLockedTokens.should.be.bignumber.equal(0);
      });
      it('should not be able to lock tokens more than balance', async function() {
        await assertRevert(
          tc.lock(CLA, initialTokenBalance.plus(1e18), validity, {
            from: member1
          })
        );
      });
      it('should be able to lock tokens', async function() {
        await tc.lock(CLA, lockTokens, validity, {
          from: member1
        });
        eventlogs = this.logs;
        const lockedTokens = initialLockedTokens.plus(lockTokens);
        const newTokenBalance = initialTokenBalance.minus(lockTokens);
        newTokenBalance.should.be.bignumber.equal(await tk.balanceOf(member1));
        lockedTokens.should.be.bignumber.equal(
          await tc.tokensLocked(member1, CLA)
        );
      });
      it('emits Lock event', async function() {
        const lockTokens = ether(2);
        await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
        const { logs } = await tc.lock(CLA, lockTokens, validity, {
          from: member2
        });
        const event = expectEvent.inLogs(logs, 'Locked', {
          _of: member2
        });
        event.args._amount.should.be.bignumber.equal(lockTokens);
        event.args._validity.should.be.bignumber.equal(
          (await latestTime()) + validity
        );
      });
      it('should not have locked tokens for other reason', async function() {
        (await tc.tokensLocked(member1, 'YOLO')).should.be.bignumber.equal(0);
      });
    });
    describe('Lock Tokens under CA more than once', function() {
      it('reverts', async function() {
        await assertRevert(
          tc.lock(CLA, 5000, await latestTime(), { from: member1 })
        );
      });
    });
    //end of first describe
    describe('Extend validity of Locked Tokens', function() {
      const extendValidity = duration.days(2);
      let initialLockedTokens;
      describe('Before validity expires', function() {
        it('should have some locked tokens', async function() {
          initialLockedTokens = await tc.tokensLocked(member1, CLA);
          initialLockedTokens.should.be.bignumber.not.equal(0);
        });
        it('should be able to extend locked tokens validity', async function() {
          const initialValidity = await tc.getLockedTokensValidity(
            member1,
            CLA
          );
          await tc.extendLock(CLA, extendValidity, { from: member1 });
          (await tc.getLockedTokensValidity(
            member1,
            CLA
          )).should.be.bignumber.equal(initialValidity.plus(extendValidity));
        });
      });
      describe('After validity expires if tokens not claimed', function() {
        before(async function() {
          const validity = await tc.getLockedTokensValidity(member1, CLA);
          await increaseTimeTo(validity.plus(2));
        });
        it('increase validity', async function() {
          await tc.extendLock(CLA, extendValidity, { from: member1 });
        });
      });
    });
    //end of second describe

    describe('Increase amount of locked Tokens', function() {
      describe('Before validity expires', function() {
        before(async function() {
          await tf.payJoiningFee(member3, { from: member3, value: fee });
          await tf.kycVerdict(member3, true);
          await P1.buyToken({ from: member3, value: ether(1) });
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
          await tc.lock(CLA, lockTokens, validity, {
            from: member3
          });
        });
        let initialLockedTokens;

        it('should have some locked tokens', async function() {
          initialLockedTokens = await tc.tokensLocked(member3, CLA);
          initialLockedTokens.should.be.bignumber.not.equal(0);
        });

        it('should be able to increase amount of lock tokens', async function() {
          const initialTokenBalance = await tk.balanceOf(member3);
          await tc.increaseLockAmount(CLA, extendLockTokens, {
            from: member3
          });
          const newTokenBalance = initialTokenBalance.minus(extendLockTokens);
          const newLockedTokens = initialLockedTokens.plus(extendLockTokens);
          newLockedTokens.should.be.bignumber.equal(
            await tc.tokensLocked(member3, CLA)
          );
          newTokenBalance.should.be.bignumber.equal(
            await tk.balanceOf(member3)
          );
        });
      });

      describe('After claiming tokens on validity expire', function() {
        before(async function() {
          const validity = await tc.getLockedTokensValidity(member1, CLA);
          await increaseTimeTo(validity.plus(2));
          await tc.unlock(member1);
        });
        it('reverts', async function() {
          await assertRevert(
            tc.increaseLockAmount(CLA, extendLockTokens, { from: member1 })
          );
        });
      });
    });
    //end of increase lock token describe
  });

  describe('Unlock Tokens', function() {
    describe('After validity expires', function() {
      let initialTokenBalance;
      let initialLockedTokens;
      before(async function() {
        initialTokenBalance = await tk.balanceOf(member2);
        initialLockedTokens = await tc.tokensLocked(member2, CLA);
      });
      it('should return 0 locked token', async function() {
        await tc.unlock(member2);
        const lockedTokens = await tc.tokensLockedAtTime(
          member2,
          CLA,
          await latestTime()
        );
        lockedTokens.should.be.bignumber.equal(0);
      });
      it('balance of member should increase', async function() {
        (await tk.balanceOf(member2)).should.be.bignumber.equal(
          initialTokenBalance.plus(initialLockedTokens)
        );
      });
    });
  });

  describe('Change Lock', function() {
    const lockTokens = ether(2);
    const validity = duration.days(30);
    describe('Zero locked tokens', function() {
      it('reverts', async function() {
        await assertRevert(tc.reduceLock(CLA, member1, await duration.days(1)));
      });
    });
    describe('Non zero locked Tokens', function() {
      before(async function() {
        await tc.lock(CLA, lockTokens, validity, {
          from: member1
        });
      });

      it('Reduce validity of locked tokens', async function() {
        await tc.reduceLock(member1, CLA, await duration.days(1));
        const newValidity = await tc.getLockedTokensValidity(member1, CLA);
        newValidity.should.be.bignumber.below((await latestTime()) + validity);
      });
    });
  });

  //contract block
});
