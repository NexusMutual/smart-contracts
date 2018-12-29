const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctions');
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

contract('NXMToken:Staking', function([owner, member1, member2, notMember]) {
  const fee = ether(0.002);
  const stakeTokens = ether(5);
  const tokens = ether(200);
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
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tf.payJoiningFee(member2, { from: member2, value: fee });
    await tf.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.transfer(member1, tokens);
    await tk.transfer(member2, tokens);
  });

  describe('Stake Tokens', function() {
    describe('Staker is not member', function() {
      it('reverts', async function() {
        await assertRevert(
          tf.addStake(stakedContract, stakeTokens, { from: notMember })
        );
      });
    });
    describe('Staker is member', function() {
      describe('Staker does not have enough tokens', function() {
        it('reverts', async function() {
          await assertRevert(
            tf.addStake(stakedContract, stakeTokens.plus(1e24), {
              from: member1
            })
          );
        });
      });

      describe('Staker does have enough tokens', function() {
        let initialTokenBalance;
        let initialStakedTokens;
        it('should have zero staked tokens before', async function() {
          initialTokenBalance = await tk.balanceOf(member1);
          initialStakedTokens = await tf.getStakerAllLockedTokens.call(member1);
          initialStakedTokens.should.be.bignumber.equal(0);
        });

        it('should be able to add stake on Smart Contracts', async function() {
          await tf.addStake(stakedContract, stakeTokens, { from: member1 });
          const newStakedTokens = initialStakedTokens.plus(stakeTokens);
          newStakedTokens.should.be.bignumber.equal(
            await tf.getStakerAllLockedTokens.call(member1)
          );
        });
        it('should decrease balance of member', async function() {
          const newTokenBalance = initialTokenBalance.minus(stakeTokens);
          newTokenBalance.should.be.bignumber.equal(
            await tk.balanceOf(member1)
          );
        });
        it('should return zero stake amt for non staker', async function() {
          initialStakedTokens = await tf.getStakerAllLockedTokens.call(member2);
          (await tf.getStakerAllLockedTokens.call(
            member2
          )).should.be.bignumber.equal(initialStakedTokens);
        });
        describe('after 250 days', function() {
          before(async function() {
            await tf.addStake(member2, stakeTokens, { from: member2 });
            let time = await latestTime();
            time = time + (await duration.days(251));
            await increaseTimeTo(time);
            await tf.unlockStakerUnlockableTokens(member2);
          });
          it('staker should have zero total locked nxm tokens against smart contract', async function() {
            const lockedTokens = await tf.getStakerAllLockedTokens.call(
              member2
            );
            lockedTokens.should.be.bignumber.equal(0);
          });
        });
      });
    });
  });
  //contract block
});
