const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const TokenData = artifacts.require('TokenDataMock');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const { ether } = require('./utils/ether');
const { assertRevert } = require('./utils/assertRevert');
const { increaseTimeTo } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const expectEvent = require('./utils/expectEvent');
const { advanceBlock } = require('./utils/advanceToBlock');

const ETH = '0x455448';
const fee = ether(0.002);
let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
let tk;
let tc;
let p1;
let p2;
let mr;
let nxms;
let td;
let tf;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Token Module', function([owner, member1]) {
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    p1 = await Pool1.deployed();
    p2 = await Pool2.deployed();
    nxms = await NXMaster.deployed();
    tf = await TokenFunctions.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    td = await TokenData.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);

    await tf.upgradeCapitalPool(owner);
    await p1.sendTransaction({ from: owner, value: 50 * 1e18 });
    await p1.upgradeInvestmentPool(owner);

    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    // await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.transfer(member1, 30000 * 1e18, { from: owner });
    // console.log(await tk.allowance(owner, tc.address));

    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: owner });
  });
  describe('NXMToken: ', function() {
    it('20.1 onlyOperator "require" operator - else condition', async function() {
      await assertRevert(tk.mint(owner, 1)); // tc.mint is changed to tk.mint hence it needs to assertRevert
    });

    it('20.2 approve function "require" - else ZERO_ADDRESS condition is checked', async function() {
      await assertRevert(
        tk.approve(ZERO_ADDRESS, UNLIMITED_ALLOWANCE, { from: member1 })
      );
    });

    it('20.3 decreaseAllowance function is called, ZERO_ADDRESS is also checked', async function() {
      await tk.decreaseAllowance(tc.address, 0.1 * UNLIMITED_ALLOWANCE, {
        from: owner
      });
      await assertRevert(
        tk.decreaseAllowance(ZERO_ADDRESS, 0.1 * UNLIMITED_ALLOWANCE, {
          from: owner
        })
      );
    });

    it('20.4 increaseAllowance function is called, ZERO_ADDRESS is also checked', async function() {
      await assertRevert(
        tk.increaseAllowance(ZERO_ADDRESS, 0.1 * UNLIMITED_ALLOWANCE, {
          from: owner
        })
      );
      await tk.increaseAllowance(tc.address, 0.1 * UNLIMITED_ALLOWANCE, {
        from: owner
      });
    });

    it('20.5 transfer function "require" - else conditions are checked', async function() {
      // to check that transfer is not made to ZERO_ADDRESS
      await assertRevert(
        tk.transfer(ZERO_ADDRESS, 30000 * 1e18, { from: owner })
      );

      // to check that owner is not locked for MV
      // await tc.lockForMemberVote(owner, 2); // lock the owner, so that it cannot transfer
      // await assertRevert(tk.transfer(member1, 30000 * 1e18, { from: owner }));
    });

    it('20.6 _mint function "require" - else ZERO_ADDRESS condition is checked', async function() {
      await assertRevert(tf.mint(ZERO_ADDRESS, 1));
    });

    it('20.7 should not be able to burn more than user balance', async function() {
      await assertRevert(
        tf.burnFrom(member1, (await tk.balanceOf(member1)) / 1 + 1)
      );
    });

    it('20.8 should not be able to reduce lock if no locked tokens', async function() {
      await assertRevert(tf.reduceLock(member1, 'random', await latestTime()));
    });

    it('20.9 should not be able to burn if no locked tokens', async function() {
      await assertRevert(tf.burnLockedTokens(member1, 'random', 10e18));
    });

    it('20.10 should not be able to release tokens more than he have locked', async function() {
      await assertRevert(tf.releaseLockedTokens(member1, 'random', 10e18));
    });
  });
});
