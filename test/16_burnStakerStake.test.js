const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenData');
const Pool1 = artifacts.require('Pool1Mock');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const stakedContract = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';

let tk;
let tf;
let tc;
let td;
let P1;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Staking', function([owner, UW1, UW2, UW3]) {
  const fee = ether(0.002);
  const stakeTokens = ether(2500);
  const tokens = ether(2500);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.deployed();
    td = await TokenData.deployed();
    await tf.payJoiningFee(UW1, { from: UW1, value: fee });
    await tf.kycVerdict(UW1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: UW1 });
    await tf.payJoiningFee(UW2, { from: UW2, value: fee });
    await tf.kycVerdict(UW2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: UW2 });
    await tf.payJoiningFee(UW3, { from: UW3, value: fee });
    await tf.kycVerdict(UW3, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: UW3 });
    await tk.transfer(UW1, tokens);
    await tk.transfer(UW2, tokens);
    await tk.transfer(UW3, tokens);
  });

  describe('Stake Tokens', function() {
    describe('Staker is member', function() {
      describe('Staker does have enough tokens', function() {
        let initialTokenBalance;
        let initialStakedTokens;

        describe('At day 1', function() {
          it('should be able to add stake on Smart Contracts', async function() {
            await tf.addStake(stakedContract, stakeTokens, { from: UW1 });
          });
        });
        describe('At day 10', function() {
          it('should be able to add stake on Smart Contracts', async function() {
            let initialBal = await tk.balanceOf(UW1);
            let time = await latestTime();
            time = time + (await duration.days(10));
            await increaseTimeTo(time + 10);
            await tf.addStake(stakedContract, stakeTokens, { from: UW2 });
            console.log('rr');
            await tf.unlockStakerUnlockableTokens(UW1);
            console.log('rr');
            let newBal = await tk.balanceOf(UW1);
            console.log(
              'initialBal ',
              parseFloat(initialBal),
              ' newBal ',
              parseFloat(newBal)
            );
          });
        });
        describe('At day 20', function() {
          it('should be able to add stake on Smart Contracts', async function() {
            let time = await latestTime();
            time = time + (await duration.days(10));
            await increaseTimeTo(time + 10);
            await tf.addStake(UW3, stakeTokens, { from: UW3 });
            // let tx = await tf.burnStakerLockedToken(stakedContract,4000*1e18);
            // let burnedUW1 = tx.receipt.logs[0].data;
            // let burnedUW2 = tx.receipt.logs[2].data;
            // console.log('burnedUW1 ',burnedUW1,' burnedUW2 ',burnedUW2);
          });
        });
        describe('At day 21', function() {
          it('should be able to add stake on Smart Contracts', async function() {
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
          });
        });
        describe('At day 90', function() {
          it('should be able to add stake on Smart Contracts', async function() {
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
          });
        });
        describe('At day 100', function() {
          it('should be able to add stake on Smart Contracts', async function() {
            let time = await latestTime();
            time = time + (await duration.days(10));
            await increaseTimeTo(time + 10);
            // let tx1 = await tf.burnStakerLockedToken(stakedContract,1000*1e18);
            // let burnedUW2 = tx1.receipt.logs;
            // let burnedUW3 = tx1.receipt.logs[2].data;
            // console.log('burnedUW2 ',burnedUW2);
          });
        });
        describe('At day 101', function() {
          it('should be able to add stake on Smart Contracts', async function() {
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
          });
        });

        describe('At day 150', function() {
          it('should be able to add stake on Smart Contracts', async function() {
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
          });
        });

        describe('after 270 days', function() {
          it('should be able to add stake on Smart Contracts', async function() {
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
          });
        });
      });
    });
    //contract block
  });
});
