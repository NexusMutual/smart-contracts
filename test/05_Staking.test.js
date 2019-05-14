const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const Pool1 = artifacts.require('Pool1Mock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const ClaimsReward = artifacts.require('ClaimsReward');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether, toHex, toWei } = require('./utils/ethTools');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const stakedContract = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';

let tk;
let tf;
let tc;
let td;
let P1;
let mr;
let nxms;
let cr;
const BN = web3.utils.BN;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Staking', function([owner, member1, member2, notMember]) {
  const fee = ether(0.002);
  const stakeTokens = ether(5);
  const tokens = ether(200);
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    cr = await ClaimsReward.deployed();
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.transfer(member1, tokens);
    await tk.transfer(member2, tokens);
  });

  describe('Stake Tokens', function() {
    describe('Staker is not member', function() {
      it('5.1 reverts', async function() {
        await assertRevert(
          tf.addStake(stakedContract, stakeTokens, { from: notMember })
        );
      });
    });
    describe('Staker is member', function() {
      describe('Staker does not have enough tokens', function() {
        it('5.2 reverts', async function() {
          await assertRevert(
            tf.addStake(
              stakedContract,
              new BN(stakeTokens.toString()).add(
                new BN(toWei(1000000).toString())
              ),
              {
                from: member1
              }
            )
          );
        });
      });

      describe('Staker does have enough tokens', function() {
        let initialTokenBalance;
        let initialStakedTokens;
        it('5.3 should have zero staked tokens before', async function() {
          initialTokenBalance = await tk.balanceOf(member1);
          initialStakedTokens = await tf.getStakerAllLockedTokens.call(member1);
          initialStakedTokens.toString().should.be.equal((0).toString());
        });

        it('5.4 should be able to add stake on Smart Contracts', async function() {
          await tf.addStake(stakedContract, stakeTokens, { from: member1 });
          const newStakedTokens = new BN(initialStakedTokens.toString()).add(
            new BN(stakeTokens.toString())
          );
          newStakedTokens
            .toString()
            .should.be.equal(
              (await tf.getStakerAllLockedTokens.call(member1)).toString()
            );
        });
        it('5.5 should decrease balance of member', async function() {
          const newTokenBalance = new BN(initialTokenBalance.toString()).sub(
            new BN(stakeTokens.toString())
          );
          newTokenBalance
            .toString()
            .should.be.equal((await tk.balanceOf(member1)).toString());
        });
        it('5.6 should return zero stake amt for non staker', async function() {
          initialStakedTokens = await tf.getStakerAllLockedTokens.call(member2);
          (await tf.getStakerAllLockedTokens.call(member2))
            .toString()
            .should.be.equal(initialStakedTokens.toString());
        });
        describe('after 250 days', function() {
          before(async function() {
            await tf.addStake(member2, stakeTokens, { from: member2 });
            let time = await latestTime();
            time = time + (await duration.days(251));
            await increaseTimeTo(time);
            await cr.claimAllPendingReward(20, { from: member2 });
          });
          it('5.7 staker should have zero total locked nxm tokens against smart contract', async function() {
            const lockedTokens = await tf.getStakerAllLockedTokens.call(
              member2
            );
            lockedTokens.toString().should.be.equal((0).toString());
          });
        });
      });
    });
  });
  //contract block
});
