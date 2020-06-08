const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const ClaimsReward = artifacts.require('ClaimsReward');

const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, duration} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');

const stakedContract = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';

let tk;
let tf;
let tc;
let td;
let P1;
let nxms;
let mr;
let cr;
const BN = web3.utils.BN;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Staking', function([owner, UW1, UW2, UW3]) {
  const fee = ether(0.002);
  const stakeTokens = toWei(2500);
  const tokens = toWei(2500);
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    nxms = await NXMaster.at(await td.ms());
    cr = await ClaimsReward.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mr.payJoiningFee(UW1, {from: UW1, value: fee});
    await mr.kycVerdict(UW1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: UW1});
    await mr.payJoiningFee(UW2, {from: UW2, value: fee});
    await mr.kycVerdict(UW2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: UW2});
    await mr.payJoiningFee(UW3, {from: UW3, value: fee});
    await mr.kycVerdict(UW3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: UW3});
    await tk.transfer(UW1, tokens);
    await tk.transfer(UW2, tokens);
    await tk.transfer(UW3, tokens);
  });

  describe('Stake Tokens', function() {
    describe('Staker is member', function() {
      describe('Staker does have enough tokens', function() {
        let initialTokenBalance;
        let initialStakedTokens;

        describe('At day 0', function() {
          it('16.1 UW1 to add stake on Smart Contracts', async function() {
            await tf.addStake(stakedContract, stakeTokens, {from: UW1});
            (
              await tf.getStakerLockedTokensOnSmartContract(
                UW1,
                stakedContract,
                0
              )
            )
              .toString()
              .should.be.equal(stakeTokens.toString());
          });
        });
        describe('At day 10', function() {
          it('16.2 UW2 to add stake on Smart Contracts, UW1 to Unlock 100 NXMs', async function() {
            let initialBal = await tk.balanceOf(UW1);
            let time = await latestTime();
            time = time + (await duration.days(10));
            await increaseTimeTo(time + 10);
            await tf.addStake(stakedContract, stakeTokens, {from: UW2});
            await tf.unlockStakerUnlockableTokens(UW1);
            let newBal = await tk.balanceOf(UW1);
            console.log(
              'initialBal ',
              parseFloat(initialBal),
              ' newBal ',
              parseFloat(newBal)
            );
            (
              await tf.getStakerLockedTokensOnSmartContract(
                UW2,
                stakedContract,
                1
              )
            )
              .toString()
              .should.be.equal(stakeTokens.toString());
            (newBal / 1).should.be.equal(initialBal / 1 + 100 * toWei(1));
          });
        });
        describe('At day 20', function() {
          it('16.3 UW3 to add stake on Smart Contracts,4000 NXMs burned from Stakers', async function() {
            let time = await latestTime();
            time = time + (await duration.days(10));
            await increaseTimeTo(time + 10);
            await tf.addStake(stakedContract, stakeTokens, {from: UW3});
            await tf.burnStakerLockedToken(stakedContract, 0);
            let tx = await tf.burnStakerLockedToken(
              stakedContract,
              toWei(4000)
            );
            let burnedUW1 = await td.stakerStakedContracts(UW1, 0);
            let burnedUW2 = await td.stakerStakedContracts(UW2, 0);
            let burnedUW3 = await td.stakerStakedContracts(UW3, 0);
            console.log(
              'burnedUW1 ',
              burnedUW1[5] / 1,
              ' burnedUW2 ',
              burnedUW2[5] / 1
            );
            (
              await tf.getStakerLockedTokensOnSmartContract(
                UW3,
                stakedContract,
                2
              )
            )
              .toString()
              .should.be.equal(stakeTokens.toString());
            (burnedUW1[5] / 1).should.be.equal(2300 * toWei(1));
            (burnedUW2[5] / 1).should.be.equal(1700 * toWei(1));
            (burnedUW3[5] / 1).should.be.equal(0);
          });
        });
        describe('At day 21', function() {
          it('16.4 UW1 and UW2 unlockable Tokens are 100,UW3 Unlocked tokens 10', async function() {
            let initialBalUW1 = await tk.balanceOf(UW1);
            let initialBalUW2 = await tk.balanceOf(UW2);
            let initialBalUW3 = await tk.balanceOf(UW3);
            let time = await latestTime();
            time = time + (await duration.days(1));
            await increaseTimeTo(time + 10);

            let unlockableUW1 = await tf.getStakerAllUnlockableStakedTokens(
              UW1
            );
            let unlockableUW2 = await tf.getStakerAllUnlockableStakedTokens(
              UW2
            );
            let unlockableUW3 = await tf.getStakerAllUnlockableStakedTokens(
              UW3
            );
            console.log(
              'unlockableUW1 ',
              parseFloat(unlockableUW1),
              ' unlockableUW2 ',
              parseFloat(unlockableUW2),
              ' unlockableUW3 ',
              parseFloat(unlockableUW3)
            );
            await tf.unlockStakerUnlockableTokens(UW1);
            await tf.unlockStakerUnlockableTokens(UW2);
            await tf.unlockStakerUnlockableTokens(UW3);
            let newBalUW1 = await tk.balanceOf(UW1);
            let newBalUW2 = await tk.balanceOf(UW2);
            let newBalUW3 = await tk.balanceOf(UW3);
            console.log(
              'initialBalUW1 ',
              parseFloat(initialBalUW1),
              ' newBalUW1 ',
              parseFloat(newBalUW1),
              ' initialBalUW2 ',
              parseFloat(initialBalUW2),
              ' newBalUW2 ',
              parseFloat(newBalUW2),
              ' initialBalUW3 ',
              parseFloat(initialBalUW3),
              ' newBalUW3 ',
              parseFloat(newBalUW3)
            );
            ((newBalUW1 - initialBalUW1) / 1).should.be.equal(100 * toWei(1));
            ((newBalUW2 - initialBalUW2) / 1).should.be.equal(100 * toWei(1));
            ((newBalUW3 - initialBalUW3) / 1).should.be.equal(10 * toWei(1));
          });
        });
        describe('At day 90', function() {
          it('16.5 UW1 and UW2 unlockable Tokens are 0,UW3 Unlocked tokens 690', async function() {
            let initialBalUW1 = await tk.balanceOf(UW1);
            let initialBalUW2 = await tk.balanceOf(UW2);
            let initialBalUW3 = await tk.balanceOf(UW3);
            let time = await latestTime();
            time = time + (await duration.days(69));
            await increaseTimeTo(time + 10);
            let unlockableUW1 = await tf.getStakerAllUnlockableStakedTokens(
              UW1
            );
            let unlockableUW2 = await tf.getStakerAllUnlockableStakedTokens(
              UW2
            );
            let unlockableUW3 = await tf.getStakerAllUnlockableStakedTokens(
              UW3
            );
            console.log(
              'unlockableUW1 ',
              parseFloat(unlockableUW1),
              ' unlockableUW2 ',
              parseFloat(unlockableUW2),
              ' unlockableUW3 ',
              parseFloat(unlockableUW3)
            );
            await tf.unlockStakerUnlockableTokens(UW1);
            await tf.unlockStakerUnlockableTokens(UW2);
            await tf.unlockStakerUnlockableTokens(UW3);
            let newBalUW1 = await tk.balanceOf(UW1);
            let newBalUW2 = await tk.balanceOf(UW2);
            let newBalUW3 = await tk.balanceOf(UW3);
            console.log(
              'initialBalUW1 ',
              parseFloat(initialBalUW1),
              ' newBalUW1 ',
              parseFloat(newBalUW1),
              ' initialBalUW2 ',
              parseFloat(initialBalUW2),
              ' newBalUW2 ',
              parseFloat(newBalUW2),
              ' initialBalUW3 ',
              parseFloat(initialBalUW3),
              ' newBalUW3 ',
              parseFloat(newBalUW3)
            );
            ((newBalUW1 - initialBalUW1) / 1).should.be.equal(0);
            ((newBalUW2 - initialBalUW2) / 1).should.be.equal(0);
            ((newBalUW3 - initialBalUW3) / 1).should.be.equal(690 * toWei(1));
          });
        });
        describe('At day 100', function() {
          it('16.6 1000 NXMs burned from Stakers', async function() {
            let time = await latestTime();
            time = time + (await duration.days(10));
            await increaseTimeTo(time + 10);
            let alreadyBurnedUW1 = await td.stakerStakedContracts(UW1, 0);
            let alreadyBurnedUW2 = await td.stakerStakedContracts(UW2, 0);
            let alreadyBurnedUW3 = await td.stakerStakedContracts(UW3, 0);
            let tx1 = await tf.burnStakerLockedToken(
              stakedContract,
              toWei(1000)
            );
            let burnedUW1 = await td.stakerStakedContracts(UW1, 0);
            let burnedUW2 = await td.stakerStakedContracts(UW2, 0);
            let burnedUW3 = await td.stakerStakedContracts(UW3, 0);
            console.log(
              'burnedUW2 ',
              burnedUW2[5] / 1 - alreadyBurnedUW2[5] / 1
            );
            console.log(
              'burnedUW3 ',
              burnedUW3[5] / 1 - alreadyBurnedUW3[5] / 1
            );
            (burnedUW1[5] / 1 - alreadyBurnedUW1[5] / 1).should.be.equal(0);
            (burnedUW2[5] / 1 - alreadyBurnedUW2[5] / 1).should.be.equal(
              700 * toWei(1)
            );
            (burnedUW3[5] / 1 - alreadyBurnedUW3[5] / 1).should.be.equal(
              300 * toWei(1)
            );
          });
        });
        describe('At day 101', function() {
          it('16.7 UW1 and UW2 unlockable Tokens are 0,UW3 Unlocked tokens 100', async function() {
            let initialBalUW1 = await tk.balanceOf(UW1);
            let initialBalUW2 = await tk.balanceOf(UW2);
            let initialBalUW3 = await tk.balanceOf(UW3);
            let time = await latestTime();
            time = time + (await duration.days(1));
            await increaseTimeTo(time + 10);
            let unlockableUW1 = await tf.getStakerAllUnlockableStakedTokens(
              UW1
            );
            let unlockableUW2 = await tf.getStakerAllUnlockableStakedTokens(
              UW2
            );
            let unlockableUW3 = await tf.getStakerAllUnlockableStakedTokens(
              UW3
            );
            console.log(
              'unlockableUW1 ',
              parseFloat(unlockableUW1),
              ' unlockableUW2 ',
              parseFloat(unlockableUW2),
              ' unlockableUW3 ',
              parseFloat(unlockableUW3)
            );
            await tf.unlockStakerUnlockableTokens(UW1);
            await tf.unlockStakerUnlockableTokens(UW2);
            await tf.unlockStakerUnlockableTokens(UW3);
            let newBalUW1 = await tk.balanceOf(UW1);
            let newBalUW2 = await tk.balanceOf(UW2);
            let newBalUW3 = await tk.balanceOf(UW3);
            console.log(
              'initialBalUW1 ',
              parseFloat(initialBalUW1),
              ' newBalUW1 ',
              parseFloat(newBalUW1),
              ' initialBalUW2 ',
              parseFloat(initialBalUW2),
              ' newBalUW2 ',
              parseFloat(newBalUW2),
              ' initialBalUW3 ',
              parseFloat(initialBalUW3),
              ' newBalUW3 ',
              parseFloat(newBalUW3)
            );
            ((newBalUW1 - initialBalUW1) / 1).should.be.equal(0);
            ((newBalUW2 - initialBalUW2) / 1).should.be.equal(0);
            ((newBalUW3 - initialBalUW3) / 1)
              .toString()
              .should.be.equal(toWei(100));
          });
        });

        describe('At day 150', function() {
          it('16.8 UW1 and UW2 unlockable Tokens are 0,UW3 Unlocked tokens 200', async function() {
            let initialBalUW1 = await tk.balanceOf(UW1);
            let initialBalUW2 = await tk.balanceOf(UW2);
            let initialBalUW3 = await tk.balanceOf(UW3);
            let time = await latestTime();
            time = time + (await duration.days(49));
            await increaseTimeTo(time + 10);
            let unlockableUW1 = await tf.getStakerAllUnlockableStakedTokens(
              UW1
            );
            let unlockableUW2 = await tf.getStakerAllUnlockableStakedTokens(
              UW2
            );
            let unlockableUW3 = await tf.getStakerAllUnlockableStakedTokens(
              UW3
            );
            console.log(
              'unlockableUW1 ',
              parseFloat(unlockableUW1),
              ' unlockableUW2 ',
              parseFloat(unlockableUW2),
              ' unlockableUW3 ',
              parseFloat(unlockableUW3)
            );
            await tf.unlockStakerUnlockableTokens(UW1);
            await tf.unlockStakerUnlockableTokens(UW2);
            await tf.unlockStakerUnlockableTokens(UW3);
            let newBalUW1 = await tk.balanceOf(UW1);
            let newBalUW2 = await tk.balanceOf(UW2);
            let newBalUW3 = await tk.balanceOf(UW3);
            console.log(
              'initialBalUW1 ',
              parseFloat(initialBalUW1),
              ' newBalUW1 ',
              parseFloat(newBalUW1),
              ' initialBalUW2 ',
              parseFloat(initialBalUW2),
              ' newBalUW2 ',
              parseFloat(newBalUW2),
              ' initialBalUW3 ',
              parseFloat(initialBalUW3),
              ' newBalUW3 ',
              parseFloat(newBalUW3)
            );
            ((newBalUW1 - initialBalUW1) / 1).should.be.equal(0);
            ((newBalUW2 - initialBalUW2) / 1).should.be.equal(0);
            ((newBalUW3 - initialBalUW3) / 1)
              .toString()
              .should.be.equal(toWei(200));
          });
        });

        describe('after 270 days', function() {
          it('16.9 UW1 and UW2 unlockable Tokens are 0,UW3 Unlocked tokens 1200', async function() {
            let initialBalUW1 = await tk.balanceOf(UW1);
            let initialBalUW2 = await tk.balanceOf(UW2);
            let initialBalUW3 = await tk.balanceOf(UW3);
            let time = await latestTime();
            time = time + (await duration.days(120));
            await increaseTimeTo(time + 10);
            let unlockableUW1 = await tf.getStakerAllUnlockableStakedTokens(
              UW1
            );
            let unlockableUW2 = await tf.getStakerAllUnlockableStakedTokens(
              UW2
            );
            let unlockableUW3 = await tf.getStakerAllUnlockableStakedTokens(
              UW3
            );
            console.log(
              'unlockableUW1 ',
              parseFloat(unlockableUW1),
              ' unlockableUW2 ',
              parseFloat(unlockableUW2),
              ' unlockableUW3 ',
              parseFloat(unlockableUW3)
            );
            await tf.unlockStakerUnlockableTokens(UW1);
            await tf.unlockStakerUnlockableTokens(UW2);
            await tf.unlockStakerUnlockableTokens(UW3);
            let newBalUW1 = await tk.balanceOf(UW1);
            let newBalUW2 = await tk.balanceOf(UW2);
            let newBalUW3 = await tk.balanceOf(UW3);
            console.log(
              'initialBalUW1 ',
              parseFloat(initialBalUW1),
              ' newBalUW1 ',
              parseFloat(newBalUW1),
              ' initialBalUW2 ',
              parseFloat(initialBalUW2),
              ' newBalUW2 ',
              parseFloat(newBalUW2),
              ' initialBalUW3 ',
              parseFloat(initialBalUW3),
              ' newBalUW3 ',
              parseFloat(newBalUW3)
            );
            ((newBalUW1 - initialBalUW1) / 1).should.be.equal(0);
            ((newBalUW2 - initialBalUW2) / 1).should.be.equal(0);
            ((newBalUW3 / toWei(1) - initialBalUW3 / toWei(1)) / 1)
              .toString()
              .should.be.equal((1200).toString());
          });
        });
      });
    });
    //contract block
  });
});
