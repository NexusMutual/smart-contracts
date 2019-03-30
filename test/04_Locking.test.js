const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const expectEvent = require('./utils/expectEvent');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

// const ETH = '0x455448';
const CLA = '0x434c41';
const CLA2 = '0x434c412';
let tk;
let tf;
let tc;
let td;
let P1;
let mr;
let nxms;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Locking', function([owner, member1, member2, member3]) {
  const fee = ether(0.002);
  const tokens = ether(200);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.transfer(member1, tokens);
    await tk.transfer(member2, tokens);
  });
  describe('Lock Tokens', function() {
    const lockTokens = ether(1);
    const validity = duration.days(30);
    const extendLockTokens = ether(2);
    describe('Lock Tokens under Claim Assesment', function() {
      let initialLockedTokens;
      let initialTokenBalance;
      //let eventlogs;
      it('4.1 should have zero initialLockedTokens', async function() {
        initialLockedTokens = await tc.tokensLocked(member1, CLA);
        initialTokenBalance = await tk.balanceOf(member1);
        initialLockedTokens.should.be.bignumber.equal(0);
      });
      it('4.2 should not be able to lock tokens more than balance', async function() {
        await assertRevert(
          tc.lock(CLA, initialTokenBalance.plus(1e18), validity, {
            from: member1
          })
        );
      });
      it('4.3 should not be able to lock 0 tokens', async function() {
        await assertRevert(
          tc.lock(CLA, 0, validity, {
            from: member1
          })
        );
      });
      it('4.4 should be able to lock tokens', async function() {
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
      it('4.5 emits Lock event', async function() {
        const lockTokens = ether(2);
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
      it('4.6 should not have locked tokens for other reason', async function() {
        (await tc.tokensLocked(member1, 'YOLO')).should.be.bignumber.equal(0);
      });
    });
    describe('Lock Tokens under CA more than once', function() {
      it('4.7 reverts', async function() {
        await assertRevert(
          tc.lock(CLA, 5000, await latestTime(), { from: member1 })
        );
      });
    });
    //end of first describe
    describe('Extend validity of Locked Tokens', function() {
      const extendValidity = duration.days(2);
      const extendValidity2 = duration.days(5);
      let initialLockedTokens;
      describe('Before validity expires', function() {
        it('4.8 should have some locked tokens', async function() {
          initialLockedTokens = await tc.tokensLocked(member1, CLA);
          initialLockedTokens.should.be.bignumber.not.equal(0);
        });
        it('4.9 should be able to extend locked tokens validity', async function() {
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
        it('4.10 should not be able to extend lock if already unlocked all', async function() {
          await assertRevert(
            tc.extendLock(CLA2, extendValidity, { from: member1 })
          );
        });
      });
      describe('After validity expires if tokens not claimed', function() {
        beforeEach(async function() {
          const validity = await tc.getLockedTokensValidity(member1, CLA);
          await increaseTimeTo(validity.plus(2));
        });
        it('4.11 increase validity', async function() {
          await tc.extendLock(CLA, extendValidity, { from: member1 });
        });
      });
    });
    //end of second describe

    describe('Increase amount of locked Tokens', function() {
      describe('Before validity expires', function() {
        before(async function() {
          await mr.payJoiningFee(member3, { from: member3, value: fee });
          await mr.kycVerdict(member3, true);
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
          await tk.transfer(member3, tokens);
          await tc.lock(CLA, lockTokens, validity, {
            from: member3
          });
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: owner });
          await tk.transfer(owner, tokens);
          await tc.lock(CLA, lockTokens, validity, {
            from: owner
          });
        });
        let initialLockedTokens;

        it('4.12 should have some locked tokens', async function() {
          initialLockedTokens = await tc.tokensLocked(member3, CLA);
          initialLockedTokens.should.be.bignumber.not.equal(0);
        });

        it('4.13 should be able to increase amount of lock tokens of member', async function() {
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
        it('4.15 reverts', async function() {
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
      it('4.16 should return unlockable tokens for a specific reason', async function() {
        const tokensUnlockableForAReason = await tc.tokensUnlockable(
          member2,
          CLA
        );
        assert.equal(
          parseFloat(tokensUnlockableForAReason),
          parseFloat(initialLockedTokens)
        );
      });
      it('4.17 should return 0 locked token', async function() {
        const tokensUnlockable = await tc.getUnlockableTokens(member2);
        assert.equal(
          parseFloat(tokensUnlockable),
          parseFloat(initialLockedTokens)
        );
        await tc.unlock(member2);
        const lockedTokens = await tc.tokensLockedAtTime(
          member2,
          CLA,
          await latestTime()
        );
        lockedTokens.should.be.bignumber.equal(0);
      });
      it('4.18 checking that 0 tokens is unlocked and unlockable for 0 lock tokens of member', async function() {
        const unlockTransaction = await tc.unlock(member2);
        // if no tokens unlocked, following array is empty
        assert.equal(unlockTransaction['receipt']['logs'].length, 0);

        assert.equal(await tc.getUnlockableTokens(member2), 0);

        // tokens unlockable for a specific reason CLA is also 0 for cross check and to pass branch of tokenController contract
        assert.equal(await tc.tokensUnlockable(member2, CLA), 0);
      });
      it('4.19 balance of member should increase', async function() {
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
      it('4.20 reverts', async function() {
        await assertRevert(tc.reduceLock(CLA, member1, await duration.days(1)));
      });
    });
    describe('Non zero locked Tokens', function() {
      before(async function() {
        await tc.lock(CLA, lockTokens, validity, {
          from: member1
        });
      });
      it('4.21 Total locked balance of member at current time should not be 0', async function() {
        const now = await latestTime();
        const totalLockedBalanceCurrently = parseFloat(
          await tc.totalLockedBalance(member1, now)
        );
        totalLockedBalanceCurrently.should.not.be.equal(0);
      });
    });
    describe('Try to burn more than locked tockens of owner for a specific reason', function() {
      it('4.23 cannot burn, amount exceeded', async function() {
        await assertRevert(tc.burnLockedTokens(owner, CLA, lockTokens + 100));
      });
    });
    describe('Try to release more than locked tockens of owner for a specific reason', function() {
      it('4.24 cannot release, amount exceeded', async function() {
        await assertRevert(
          tc.releaseLockedTokens(owner, CLA, lockTokens + 100)
        );
      });
    });
  });

  //contract block
});
