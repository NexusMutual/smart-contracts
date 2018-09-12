const Pool1 = artifacts.require('Pool1');
const Pool3 = artifacts.require('Pool3');
const PoolData = artifacts.require('PoolData');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationData = artifacts.require('QuotationData');
const Quotation = artifacts.require('Quotation');
const NXMTokenData = artifacts.require('NXMTokenData');
const MCR = artifacts.require('MCR');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const CA_ETH = '0x45544800';
const CLA = '0x434c41';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

let P1;
let P3;
let nxmtk1;
let nxmtk2;
let cr;
let cl;
let qd;
let qt;
let cad;
let td;
let mcr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Claim: Assessment', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  coverHolder,
  notMember
]) {
  const P_18 = new BigNumber(1e18);
  const stakeTokens = ether(1);
  const tokens = ether(5);
  const validity = duration.days(30);
  let coverID;
  let closingTime;

  before(async function() {
    await advanceBlock();
    nxmtk1 = await NXMToken1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationData.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    td = await NXMTokenData.deployed();
    P3 = await Pool3.deployed();
    mcr = await MCR.deployed();
    await nxmtk2.payJoiningFee({ from: member1, value: fee });
    await P1.buyTokenBegin({ from: member1, value: ether(1) });
    await nxmtk2.payJoiningFee({ from: member2, value: fee });
    await P1.buyTokenBegin({ from: member2, value: ether(2) });
    await nxmtk2.payJoiningFee({ from: member3, value: fee });
    await P1.buyTokenBegin({ from: member3, value: ether(2) });
    await nxmtk2.payJoiningFee({ from: coverHolder, value: fee });
    await P1.buyTokenBegin({ from: coverHolder, value: ether(3) });
    await nxmtk2.addStake(smartConAdd, stakeTokens, { from: member1 });
    await nxmtk2.addStake(smartConAdd, stakeTokens, { from: member2 });
  });

  describe('Claim Assessment', function() {
    describe('Member locked Tokens for Claim Assessment', function() {
      describe('Voting is not closed yet', function() {
        describe('Members not voted yet', function() {
          describe('All CAs rejects claim', function() {
            before(async function() {
              await nxmtk1.lock(CLA, tokens.plus(P_18), validity, {
                from: member1
              });
              await nxmtk1.lock(CLA, tokens, validity, { from: member2 });
              await nxmtk1.lock(CLA, tokens, validity, { from: member3 });
              await P1.makeCoverBegin(
                PID,
                smartConAdd,
                'ETH',
                coverDetails,
                coverPeriod,
                v,
                r,
                s,
                { from: coverHolder, value: coverDetails[1] }
              );
              coverID = await qd.getAllCoversOfUser(coverHolder);
              await cl.submitClaim(coverID[0], { from: coverHolder });
              const maxVotingTime = await cd.maxVotingTime();
              const now = await latestTime();
              closingTime = maxVotingTime.plus(now);
              await cl.getClaimFromNewStart(0 ,{from: coverHolder});
              await cl.getUserClaimByIndex(0 ,{from: coverHolder});
              await cl.getClaimbyIndex(1, {from: coverHolder});
              await cl.getCATokensLockedAgainstClaim(member1, 1, {from: owner});
            });
            it('should let members to vote for claim assessment', async function() {
              await cl.submitCAVote(1, -1, { from: member1 });
              await cl.submitCAVote(1, -1, { from: member2 });
              await cl.submitCAVote(1, -1, { from: member3 });
            });
            it('should close voting after closing time', async function() {
              await increaseTimeTo(closingTime);
              (await cl.checkVoteClosing(1)).should.be.bignumber.equal(1);
            });

            it('should be able change claim status', async function() {
              await cr.changeClaimStatus(1);
              const newCStatus = await cd.getClaimStatusNumber(1);
              newCStatus[1].should.be.bignumber.equal(6);
            });
          });
        });
      });
      /*      describe('Voting is not closed yet', function() {
        before(async function() {});
      });*/
    });

    describe('Member not have locked tokens for Claim Assessment', function() {
      before(async function() {
        await nxmtk2.payJoiningFee({ from: member4, value: fee });
        await P1.buyTokenBegin({ from: member4, value: ether(2) });
        await cl.submitClaim(coverID[0], { from: coverHolder });
      });
      it('reverts', async function() {
        const claimId = (await cd.actualClaimLength()) - 1;
        await assertRevert(cl.submitCAVote(2, -1, { from: member1 }));
      });
    });
  });
});
