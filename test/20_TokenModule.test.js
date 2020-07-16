const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMasterMock');
const TokenData = artifacts.require('TokenDataMock');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const DAI = artifacts.require('MockDAI');

const {ether, toHex, toWei} = require('./utils/ethTools');
const {assertRevert} = require('./utils/assertRevert');
const {latestTime} = require('./utils/latestTime');
const {advanceBlock} = require('./utils/advanceToBlock');
const { takeSnapshot, revertSnapshot } = require('./utils/snapshot');

const fee = ether(0.002);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const UNLIMITED_ALLOWANCE = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

let dai;
let tk;
let tc;
let p1;
let p2;
let mr;
let nxms;
let td;
let tf;
let snapshotId;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Token Module', function([owner, member1]) {

  before(async function() {

    snapshotId = await takeSnapshot();

    await advanceBlock();
    tk = await NXMToken.deployed();
    p1 = await Pool1.deployed();
    p2 = await Pool2.deployed();
    nxms = await NXMaster.at(await p1.ms());
    tf = await TokenFunctions.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    td = await TokenData.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    dai = await DAI.deployed();
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await tf.upgradeCapitalPool(dai.address);
    await p1.sendEther({from: owner, value: toWei(50)});
    await p1.upgradeInvestmentPool(dai.address);
    await mr.payJoiningFee(member1, {from: member1, value: fee});
    await mr.kycVerdict(member1, true);
    // await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.transfer(member1, toWei(30000), {from: owner});

    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: owner});
  });
  describe('NXMToken: ', function() {
    it('20.1 onlyOperator "require" operator - else condition', async function() {
      await assertRevert(tk.mint(owner, 1)); // tc.mint is changed to tk.mint hence it needs to assertRevert
    });

    it('20.2 approve function "require" - else ZERO_ADDRESS condition is checked', async function() {
      await assertRevert(
        tk.approve(ZERO_ADDRESS, UNLIMITED_ALLOWANCE, {from: member1})
      );
    });

    it('20.3 decreaseAllowance function is called, ZERO_ADDRESS is also checked', async function() {
      await tk.decreaseAllowance(tc.address, UNLIMITED_ALLOWANCE, {
        from: owner
      });
      await assertRevert(
        tk.decreaseAllowance(ZERO_ADDRESS, UNLIMITED_ALLOWANCE, {
          from: owner
        })
      );
    });

    it('20.4 increaseAllowance function is called, ZERO_ADDRESS is also checked', async function() {
      await assertRevert(
        tk.increaseAllowance(ZERO_ADDRESS, UNLIMITED_ALLOWANCE, {
          from: owner
        })
      );
      await tk.increaseAllowance(tc.address, UNLIMITED_ALLOWANCE, {
        from: owner
      });
    });

    it('20.5 transfer function "require" - else conditions are checked', async function() {
      // to check that transfer is not made to ZERO_ADDRESS
      await assertRevert(
        tk.transfer(ZERO_ADDRESS, toWei(30000), {from: owner})
      );

      // to check that owner is not locked for MV
      // await tc.lockForMemberVote(owner, 2); // lock the owner, so that it cannot transfer
      // await assertRevert(tk.transfer(member1, towei(30000), { from: owner }));
    });

    it('20.6 _mint function "require" - else ZERO_ADDRESS condition is checked', async function() {
      await assertRevert(tf.mint(ZERO_ADDRESS, 1));
    });

    it('20.7 should not be able to burn more than user balance', async function() {
      await assertRevert(
        tf.burnFrom(member1, (await tk.balanceOf(member1)).toString())
      );
    });

    it('20.8 should not be able to reduce lock if no locked tokens', async function() {
      await assertRevert(
        tf.reduceLock(member1, toHex('random'), await latestTime())
      );
    });

    it('20.9 should not be able to burn if no locked tokens', async function() {
      await assertRevert(
        tf.burnLockedTokens(member1, toHex('random'), toWei(10))
      );
    });

    it('20.10 should not be able to release tokens more than he have locked', async function() {
      await assertRevert(
        tf.releaseLockedTokens(member1, toHex('random'), toWei(10))
      );
    });
  });

  after(async function () {
    await revertSnapshot(snapshotId);
  });

});
