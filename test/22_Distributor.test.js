const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsDataMock');

const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const Governance = artifacts.require('Governance');
const DAI = artifacts.require('MockDAI');
const DSValue = artifacts.require('DSValueMock');

const Distributor = artifacts.require('Distributor');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether, toHex, toWei } = require('./utils/ethTools');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const CA_ETH = '0x45544800';
const CLA = '0x434c41';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, '3362445813369838', '744892736679184', '7972408607'];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

const coverDetailsDai = [5, '16812229066849188', '5694231991898', '7972408607'];
const vrs_dai = [
  27,
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556',
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff'
];

const buyCoverValue = new web3.utils.BN(coverDetails[1])
  .mul(new web3.utils.BN(110))
  .div(new web3.utils.BN(100));

let P1;
let p2;
let tk;
let tf;
let tc;
let td;
let cr;
let cl;
let qd;
let qt;
let cad;
let mcr;
let nxms;
let mr;
let pd;
let gv;
let dsv;
let distributor;
const BN = web3.utils.BN;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Distributor Claim: Assessment', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  member5,
  staker1,
  staker2,
  coverHolder,
  notMember,
  nftCoverHolder1,
  nftCoverHolder2
]) {
  const P_18 = new BN(toWei(1).toString());
  const stakeTokens = ether(5);
  const tokens = ether(60);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));
  const BOOK_TIME = new BN(duration.hours(13).toString());
  let coverID;
  let closingTime;
  let minTime;
  let maxVotingTime;
  let claimId;

  let priceLoadPercentage = 10;

  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    mcr = await MCR.deployed();
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    gv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    p2 = await Pool2.deployed();
    cad = await DAI.deployed();
    dsv = await DSValue.deployed();
    distributor = await Distributor.new(nxms.address, priceLoadPercentage, {
      from: coverHolder
    });

    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mcr.addMCRData(
      await getValue(toWei(2), pd, mcr),
      toWei(100),
      toWei(2),
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );
    (await pd.capReached()).toString().should.be.equal((1).toString());
    // await mr.payJoiningFee(owner, { from: owner, value: fee });
    // await mr.kycVerdict(owner, true);
    await mr.payJoiningFee(member1, { from: member1, value: fee });
    await mr.kycVerdict(member1, true);
    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, true);
    await mr.payJoiningFee(member3, { from: member3, value: fee });
    await mr.kycVerdict(member3, true);
    await mr.payJoiningFee(staker1, { from: staker1, value: fee });
    await mr.kycVerdict(staker1, true);
    await mr.payJoiningFee(staker2, { from: staker2, value: fee });
    await mr.kycVerdict(staker2, true);
    await mr.payJoiningFee(coverHolder, { from: coverHolder, value: fee });
    await mr.kycVerdict(coverHolder, true);
    await mr.payJoiningFee(distributor.address, {
      from: coverHolder,
      value: fee
    });
    await mr.kycVerdict(distributor.address, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: staker1 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: staker2 });
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: coverHolder });
    await distributor.nxmTokenApprove(tc.address, UNLIMITED_ALLOWANCE, {
      from: coverHolder
    });

    await tk.transfer(member1, ether(250));
    await tk.transfer(member2, ether(250));
    await tk.transfer(member3, ether(250));
    await tk.transfer(coverHolder, ether(250));
    await tk.transfer(distributor.address, ether(250));
    await tk.transfer(staker1, ether(250));
    await tk.transfer(staker2, ether(250));
    await tf.addStake(smartConAdd, stakeTokens, { from: staker1 });
    await tf.addStake(smartConAdd, stakeTokens, { from: staker2 });
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Member locked Tokens for Claim Assessment', function() {
    describe('Voting is not closed yet', function() {
      describe('CA not voted yet', function() {
        describe('All CAs rejects claim', function() {
          before(async function() {
            await tc.lock(CLA, tokens, validity, {
              from: member1
            });
            await tc.lock(CLA, tokens, validity, {
              from: member2
            });
            await tc.lock(CLA, tokens, validity, {
              from: member3
            });
            coverDetails[4] = '7972408607001';
            var vrsdata = await getQuoteValues(
              coverDetails,
              toHex('ETH'),
              coverPeriod,
              smartConAdd,
              qt.address
            );

            await distributor.buyCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrsdata[0],
              vrsdata[1],
              vrsdata[2],
              { from: nftCoverHolder1, value: buyCoverValue.toString() }
            );

            coverDetails[4] = '7972408607002';
            vrsdata = await getQuoteValues(
              coverDetails,
              toHex('ETH'),
              coverPeriod,
              smartConAdd,
              qt.address
            );

            await distributor.buyCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrsdata[0],
              vrsdata[1],
              vrsdata[2],
              { from: nftCoverHolder1, value: buyCoverValue.toString() }
            );

            const firstTokenId = 0;
            const submitClaimDeposit = new web3.utils.BN(coverDetails[1])
              .mul(new web3.utils.BN(5))
              .div(new web3.utils.BN(100));
            await distributor.submitClaim(firstTokenId, {
              from: nftCoverHolder1,
              value: submitClaimDeposit
            });

            const minVotingTime = await cd.minVotingTime();
            const now = await latestTime();
            minTime = new BN(minVotingTime.toString()).add(
              new BN(now.toString())
            );
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getUserClaimByIndex(0, { from: distributor.address });
            await cl.getClaimbyIndex(1, { from: distributor.address });
            claimId = (await cd.actualClaimLength()) - 1;
          });
          it('8.1 voting should be open', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((0).toString());
          });
          it('8.2 should let claim assessors to vote for claim assessment', async function() {
            let initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
            await cl.submitCAVote(claimId, -1, { from: member1 });
            await cl.submitCAVote(claimId, -1, { from: member2 });
            await cl.submitCAVote(claimId, -1, { from: member3 });
            let finalCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
            (finalCAVoteTokens[1] - initialCAVoteTokens[1]).should.be.equal(
              tokens * 3
            );
            let all_votes = await cd.getAllVotesForClaim(claimId);
            expectedVotes = all_votes[1].length;
            expectedVotes.should.be.equal(3);
            let isBooked = await td.isCATokensBooked(member1);
            isBooked.should.be.equal(true);
          });
          it('8.3 should not let claim assessors to vote for 2nd time in same claim id', async function() {
            await assertRevert(cl.submitCAVote(claimId, -1, { from: member2 }));
          });
          it('8.4 should not let member to vote for CA', async function() {
            await assertRevert(
              cl.submitMemberVote(claimId, -1, { from: member1 })
            );
          });
          it('8.5 should close voting after min time', async function() {
            await increaseTimeTo(
              new BN(minTime.toString()).add(new BN((2).toString()))
            );
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((1).toString());
          });
          it('8.6 should not able to vote after voting close', async function() {
            await assertRevert(cl.submitCAVote(claimId, 1, { from: member1 }));
          });
          it('8.7 should be able to change claim status', async function() {
            let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

            APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            await P1.__callback(APIID, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].toString().should.be.equal((6).toString());
          });
          it('8.8 voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((-1).toString());
          });
        });

        describe('All CAs accept claim', function() {
          let initialStakedTokens1;
          let initialStakedTokens2;
          let priceinEther;
          before(async function() {
            const now = await latestTime();
            await increaseTimeTo(
              new BN(BOOK_TIME.toString()).add(new BN(now.toString()))
            );

            coverID = await qd.getAllCoversOfUser(coverHolder);
            await cl.submitClaim(coverID[1], { from: coverHolder });
            claimId = (await cd.actualClaimLength()) - 1;
            initialStakedTokens1 = await tf.getStakerLockedTokensOnSmartContract(
              staker1,
              smartConAdd,
              0
            );
            initialStakedTokens2 = await tf.getStakerLockedTokensOnSmartContract(
              staker2,
              smartConAdd,
              1
            );
          });

          it('8.9 should let claim assessor to vote for claim assessment', async function() {
            await cl.submitCAVote(claimId, 1, { from: member1 });
            await cl.submitCAVote(claimId, 1, { from: member2 });
            await cl.submitCAVote(claimId, 1, { from: member3 });
            await cl.getClaimFromNewStart(0, { from: member1 });
            await cl.getClaimFromNewStart(1, { from: member1 });
            await cd.getVoteToken(claimId, 0, 1);
            await cd.getVoteVoter(claimId, 1, 1);
            let verdict = await cd.getVoteVerdict(claimId, 1, 1);
            parseFloat(verdict).should.be.equal(1);
          });
          it('8.10 should not able to vote after voting closed', async function() {
            const now = await latestTime();
            const maxVotingTime = await cd.maxVotingTime();
            closingTime = new BN(maxVotingTime.toString()).add(
              new BN(now.toString())
            );
            await increaseTimeTo(
              new BN(closingTime.toString()).add(new BN((6).toString()))
            );
            await assertRevert(cl.submitCAVote(claimId, 1, { from: member1 }));
          });
          it('8.11 orcalise call should be able to change claim status', async function() {
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            priceinEther = await mcr.calculateTokenPrice(CA_ETH);
            await P1.__callback(apiid, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].toString().should.be.equal((7).toString());
          });
          it('8.12 voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((-1).toString());
          });
        });
      });
    });
  });
});
