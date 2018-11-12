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
const stakedContract = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';

let nxmtk2;
let nxmtk1;
let nxmtd;
let P1;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Staking', function([
  owner,
  member1,
  member2,
  member3,
  notMember,
  other
]) {
  const fee = ether(0.002);
  const stakeTokens = ether(5);
  before(async function() {
    await advanceBlock();
    P1 = await Pool1.deployed();
    nxmtk1 = await NXMToken1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    nxmtd = await NXMTokenData.deployed();
    await nxmtk2.payJoiningFee(member1, { from: member1, value: fee });
    await nxmtk2.kycVerdict(member1, true);
    await P1.buyTokenBegin({ from: member1, value: ether(1) });
    await nxmtk2.payJoiningFee(member2, { from: member2, value: fee });
    await nxmtk2.kycVerdict(member2, true);
    await P1.buyTokenBegin({ from: member2, value: ether(1) });
  });
  describe('Stake Tokens', function() {
    const lockTokens = ether(1);
    const extendLockTokens = ether(2);
    describe('Staker is not member', function() {
      it('reverts', async function() {
        await assertRevert(
          nxmtk2.addStake(stakedContract, stakeTokens, { from: notMember })
        );
      });
    });
    describe('Staker is member', function() {
      describe('Staker does not have enough tokens', function() {
        it('reverts', async function() {
          await assertRevert(
            nxmtk2.addStake(stakedContract, stakeTokens.plus(9e20), {
              from: member1
            })
          );
        });
      });

      describe('Staker does have enough tokens', function() {
        let initialTokenBalance;
        let initialStakedTokens;
        it('should have zero staked tokens before', async function() {
          initialTokenBalance = await nxmtk1.balanceOf(member1);
          initialStakedTokens = await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(
            member1,
            stakedContract
          );
          initialStakedTokens.should.be.bignumber.equal(0);
        });

        it('should be able to add stake on Smart Contracts', async function() {
          await nxmtk2.addStake(stakedContract, stakeTokens, { from: member1 });

          const newStakedTokens = initialStakedTokens.plus(stakeTokens);

          newStakedTokens.should.be.bignumber.equal(
            await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(
              member1,
              stakedContract
            )
          );
        });
        it('should decrease balance of member', async function() {
          const newTokenBalance = initialTokenBalance.minus(stakeTokens);
          newTokenBalance.should.be.bignumber.equal(
            await nxmtk1.balanceOf(member1)
          );
        });
        it('should return zero stake amt for non staker', async function() {
          const initialStakedTokens = await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(
            member1,
            stakedContract
          );
          await nxmtk2.addStake(member2, stakeTokens, { from: member1 });
          (await nxmtd.getTotalStakedAmtByStakerAgainstScAddress(
            member1,
            stakedContract
          )).should.be.bignumber.equal(initialStakedTokens);
        });
        describe('after 200 days', function() {
          before(async function() {
            let time = await latestTime();
            time = time + (await duration.days(201));
            await increaseTimeTo(time);
          });
          it('staker should have zero total locked nxm tokens against smart contract', async function() {
            const lockedTokens = await nxmtk1.getTotalLockedNXMToken(
              stakedContract
            );
            lockedTokens.should.be.bignumber.equal(0);
          });
        });
      });
    });
  });
  //contract block
});
