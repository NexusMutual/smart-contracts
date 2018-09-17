const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const NXMTokenData = artifacts.require('NXMTokenData');
const Pool1 = artifacts.require('Pool1');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const expectEvent = require('./utils/expectEvent');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const ETH = '0x455448';
const CLA = '0x434c41';

let nxmtk2;
let nxmtk1;
let nxmtd;
let P1;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Locking', function([
  owner,
  member1,
  member2,
  member3,
  notMember
]) {
  const fee = ether(0.002);
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    nxmtk1 = await NXMToken1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    nxmtd = await NXMTokenData.deployed();
    await nxmtk2.payJoiningFee({ from: member1, value: fee });
    await P1.buyTokenBegin({ from: member1, value: ether(1) });
    await nxmtk2.payJoiningFee({ from: member2, value: fee });
    await P1.buyTokenBegin({ from: member2, value: ether(1) });
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
        initialLockedTokens = await nxmtk1.tokensLocked(
          member1,
          CLA,
          await latestTime()
        );
        initialTokenBalance = await nxmtk1.balanceOf(member1);
        initialLockedTokens.should.be.bignumber.equal(0);
      });
      it('should not be able to lock tokens more than balance', async function() {
        await assertRevert(
          nxmtk1.lock(CLA, initialTokenBalance.plus(1e18), validity, {
            from: member1
          })
        );
      });
      it('should be able to lock tokens', async function() {
        await nxmtk1.lock(CLA, lockTokens, validity, {
          from: member1
        });
        eventlogs = this.logs;
        const lockedTokens = initialLockedTokens.plus(lockTokens);
        const newTokenBalance = initialTokenBalance.minus(lockTokens);
        newTokenBalance.should.be.bignumber.equal(
          await nxmtk1.balanceOf(member1)
        );
        lockedTokens.should.be.bignumber.equal(
          await nxmtk1.tokensLocked(member1, CLA, await latestTime())
        );
      });
      it('emits Lock event', async function() {
        const lockTokens = ether(2);
        const { logs } = await nxmtk1.lock(CLA, lockTokens, validity, {
          from: member2
        });
        const event = expectEvent.inLogs(logs, 'Lock', {
          _of: member2
        });
        event.args._amount.should.be.bignumber.equal(lockTokens);
        event.args._validity.should.be.bignumber.equal(
          (await latestTime()) + validity
        );
      });
    });
    describe('Lock Tokens under CA more than once', function() {
      it('reverts', async function() {
        await assertRevert(
          nxmtk1.lock(CLA, 5000, await latestTime(), { from: member1 })
        );
      });
    });
    //end of first describe
    describe('Extend validity of Locked Tokens', function() {
      const extendValidity = duration.days(2);
      let initialLockedTokens;
      describe('Before validity expires', function() {
        it('should have some locked tokens', async function() {
          initialLockedTokens = await nxmtk1.tokensLocked(
            member1,
            CLA,
            await latestTime()
          );
          initialLockedTokens.should.be.bignumber.not.equal(0);
        });
        it('should be able to extend locked tokens validity', async function() {
          const initialValidity = (await nxmtd.locked(member1, CLA))[0];
          await nxmtk1.extendLock(CLA, extendValidity, { from: member1 });
          const newValidity = initialValidity.plus(extendValidity);
          newValidity.should.be.bignumber.equal(
            (await nxmtd.locked(member1, CLA))[0]
          );
        });
      });
      describe('After validity expires', function() {
        before(async function() {
          const validity = (await nxmtd.locked(member1, CLA))[0];
          await increaseTimeTo(validity.plus(2));
        });
        it('reverts', async function() {
          await assertRevert(
            nxmtk1.extendLock(CLA, extendValidity, { from: member1 })
          );
        });
      });
    });
    //end of second describe

    describe('Increase amount of locked Tokens', function() {
      describe('Before validity expires', function() {
        before(async function() {
          await nxmtk1.lock(CLA, lockTokens, validity, {
            from: member1
          });
        });
        let initialLockedTokens;

        it('should have some locked tokens', async function() {
          initialLockedTokens = await nxmtk1.tokensLocked(
            member1,
            CLA,
            await latestTime()
          );
          initialLockedTokens.should.be.bignumber.not.equal(0);
        });

        it('should be able to increase amount of lock tokens', async function() {
          const initialTokenBalance = await nxmtk1.balanceOf(member1);
          await nxmtk1.increaseLockAmount(CLA, extendLockTokens, {
            from: member1
          });
          const newTokenBalance = initialTokenBalance.minus(extendLockTokens);
          const newLockedTokens = initialLockedTokens.plus(extendLockTokens);
          newLockedTokens.should.be.bignumber.equal(
            await nxmtk1.tokensLocked(member1, CLA, await latestTime())
          );
          newTokenBalance.should.be.bignumber.equal(
            await nxmtk1.balanceOf(member1)
          );
        });
      });

      describe('After validity expires', function() {
        before(async function() {
          const validity = (await nxmtd.locked(member1, CLA))[0];
          await increaseTimeTo(validity.plus(2));
        });
        it('reverts', async function() {
          await assertRevert(
            nxmtk1.increaseLockAmount(CLA, extendLockTokens, { from: member1 })
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
        initialTokenBalance = await nxmtk1.balanceOf(member1);
        initialLockedTokens = await nxmtk1.tokensLocked(
          member1,
          CLA,
          await latestTime()
        );
      });
      it('should unlock locked tokens', async function() {
        const lockedTokens = await nxmtk1.tokensLocked(
          member1,
          CLA,
          await latestTime()
        );
        lockedTokens.should.be.bignumber.equal(0);
      });
      it('balance of member should increase', async function() {
        (await nxmtk1.balanceOf(member1)).should.be.bignumber.equal(
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
        await assertRevert(
          nxmtk1.reduceLock(CLA, member1, await duration.days(1))
        );
      });
    });
    describe('Non zero locked Tokens', function() {
      before(async function() {
        await nxmtk1.lock(CLA, lockTokens, validity, {
          from: member1
        });
      });

      it('Reduce validity of locked tokens', async function() {
        await nxmtk1.reduceLock(CLA, member1, await duration.days(1));
        const newValidity = (await nxmtd.locked(member1, CLA))[0];
        newValidity.should.be.bignumber.below((await latestTime()) + validity);
      });
    });
  });

  //contract block
});
