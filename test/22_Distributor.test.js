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

const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo, duration} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');
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
const coverDetails = [10, '3362445813369838', '744892736679184', '7972408607'];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

const coverDetailsDai = [5, '16812229066849188', '5694231991898', '7972408607'];
const vrs_dai = [
  27,
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556',
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff'
];

const priceLoadPercentage = 10;
const percentageDenominator = 100;
const coverPriceMultiplier = percentageDenominator + priceLoadPercentage;
const claimSubmitDepositPercentage = 5;

const coverBasePrice = new web3.utils.BN(coverDetails[1]);
const buyCoverValue = coverBasePrice
  .mul(new web3.utils.BN(coverPriceMultiplier))
  .div(new web3.utils.BN(percentageDenominator));
const buyCoverFee = buyCoverValue.sub(coverBasePrice);
const submitClaimDeposit = coverBasePrice
  .mul(new web3.utils.BN(claimSubmitDepositPercentage))
  .div(new web3.utils.BN(percentageDenominator));

const coverBaseDaiPrice = new web3.utils.BN(coverDetailsDai[1]);
const buyCoverDaiValue = coverBaseDaiPrice
  .mul(new web3.utils.BN(coverPriceMultiplier))
  .div(new web3.utils.BN(percentageDenominator));
const buyCoverDaiFee = buyCoverDaiValue.sub(coverBaseDaiPrice);
const submitClaimDaiDeposit = coverBaseDaiPrice
  .mul(new web3.utils.BN(claimSubmitDepositPercentage))
  .div(new web3.utils.BN(percentageDenominator));

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

function getCoverDataFromBuyCoverLogs(logs) {
  logs = Array.from(logs);
  const transferEvent = logs.filter(log => log.event === 'Transfer')[0];
  return {
    tokenId: transferEvent.args.tokenId.toString()
  };
}

contract('Distributor buy cover and claim', function([
  owner,
  member1,
  member2,
  member3,
  staker1,
  staker2,
  coverHolder,
  nftCoverHolder1,
  distributorFeeReceiver
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
    await mr.payJoiningFee(member1, {from: member1, value: fee});
    await mr.kycVerdict(member1, true);
    await mr.payJoiningFee(member2, {from: member2, value: fee});
    await mr.kycVerdict(member2, true);
    await mr.payJoiningFee(member3, {from: member3, value: fee});
    await mr.kycVerdict(member3, true);
    await mr.payJoiningFee(staker1, {from: staker1, value: fee});
    await mr.kycVerdict(staker1, true);
    await mr.payJoiningFee(staker2, {from: staker2, value: fee});
    await mr.kycVerdict(staker2, true);
    await mr.payJoiningFee(coverHolder, {from: coverHolder, value: fee});
    await mr.kycVerdict(coverHolder, true);
    await mr.payJoiningFee(distributor.address, {
      from: coverHolder,
      value: fee
    });
    await mr.kycVerdict(distributor.address, true);
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member1});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member2});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member3});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: staker1});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: staker2});
    await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: coverHolder});
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
    await tf.addStake(smartConAdd, stakeTokens, {from: staker1});
    await tf.addStake(smartConAdd, stakeTokens, {from: staker2});
    maxVotingTime = await cd.maxVotingTime();
  });

  describe('Member locked Tokens for Claim Assessment', function() {
    describe('Voting is not closed yet', function() {
      describe('CA not voted yet', function() {
        let firstTokenId;
        let secondTokenId;
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
          });

          it('allows buying cover using ETH', async () => {
            coverDetails[4] = '7972408607001';
            var vrsdata = await getQuoteValues(
              coverDetails,
              toHex('ETH'),
              coverPeriod,
              smartConAdd,
              qt.address
            );

            const buyCoverResponse1 = await distributor.buyCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrsdata[0],
              vrsdata[1],
              vrsdata[2],
              {from: nftCoverHolder1, value: buyCoverValue.toString()}
            );

            firstTokenId = getCoverDataFromBuyCoverLogs(buyCoverResponse1.logs)
              .tokenId;
          });

          it('allows buying a second cover after buying 1 already', async () => {
            coverDetails[4] = '7972408607002';
            vrsdata = await getQuoteValues(
              coverDetails,
              toHex('ETH'),
              coverPeriod,
              smartConAdd,
              qt.address
            );

            const buyCoverResponse2 = await distributor.buyCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrsdata[0],
              vrsdata[1],
              vrsdata[2],
              {from: nftCoverHolder1, value: buyCoverValue.toString()}
            );

            secondTokenId = getCoverDataFromBuyCoverLogs(buyCoverResponse2.logs)
              .tokenId;
          });

          it('allows submitting a claim for the cover', async () => {
            await distributor.submitClaim(firstTokenId, {
              from: nftCoverHolder1,
              value: submitClaimDeposit
            });

            const minVotingTime = await cd.minVotingTime();
            const now = await latestTime();
            minTime = new BN(minVotingTime.toString()).add(
              new BN(now.toString())
            );
            await cl.getClaimFromNewStart(0, {from: member1});
            await cl.getUserClaimByIndex(0, {from: distributor.address});
            await cl.getClaimbyIndex(1, {from: distributor.address});
            claimId = (await cd.actualClaimLength()) - 1;
          });

          it('should return token data for token with claim in progress', async () => {
            const tokenData = await distributor.getTokenData.call(firstTokenId);

            tokenData.coverId.should.be.equal('1');
            tokenData.claimInProgress.should.be.equal(true);
            tokenData.coverDetails[0].should.be.equal(
              coverDetails[0].toString()
            );
            tokenData.coverDetails[1].should.be.equal(coverDetails[1]);
            tokenData.coverDetails[2].should.be.equal(coverDetails[2]);
            tokenData.coverDetails[3].should.be.equal(coverDetails[3]);
            tokenData.claimId.should.be.equal(claimId.toString());
          });

          it('should return token data for token with no claim in progress', async () => {
            const tokenData = await distributor.getTokenData.call(
              secondTokenId
            );

            tokenData.coverId.should.equal('2');
            tokenData.claimInProgress.should.equal(false);
            tokenData.claimId.should.equal('0');
            tokenData.coverDetails[0].should.be.equal(
              coverDetails[0].toString()
            );
            tokenData.coverDetails[1].should.equal(coverDetails[1]);
            tokenData.coverDetails[2].should.be.equal(coverDetails[2]);
            tokenData.coverDetails[3].should.be.equal(coverDetails[3]);
          });

          it('voting should be open', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((0).toString());
          });
          it('should let claim assessors to vote for claim assessment', async function() {
            let initialCAVoteTokens = await cd.getCaClaimVotesToken(claimId);
            await cl.submitCAVote(claimId, -1, {from: member1});
            await cl.submitCAVote(claimId, -1, {from: member2});
            await cl.submitCAVote(claimId, -1, {from: member3});
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
          it('should not let claim assessors to vote for 2nd time in same claim id', async function() {
            await assertRevert(cl.submitCAVote(claimId, -1, {from: member2}));
          });
          it('should not let member to vote for CA', async function() {
            await assertRevert(
              cl.submitMemberVote(claimId, -1, {from: member1})
            );
          });
          it('should close voting after min time', async function() {
            await increaseTimeTo(
              new BN(minTime.toString()).add(new BN((2).toString()))
            );
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((1).toString());
          });
          it('should not able to vote after voting close', async function() {
            await assertRevert(cl.submitCAVote(claimId, 1, {from: member1}));
          });
          it('should be able to change claim status', async function() {
            let APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);

            const apiCallId = (await pd.getApilCallLength()) - 1;
            APIID = await pd.allAPIcall(apiCallId);
            await P1.__callback(APIID, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].toString().should.be.equal((6).toString());
          });
          it('voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((-1).toString());
          });

          it('distributor owner should be able to withdraw ETH fee from all bought covers', async function() {
            const feeReceiverBalancePreWithdrawal = new web3.utils.BN(
              await web3.eth.getBalance(distributorFeeReceiver)
            );

            // 2 covers were bought
            const withdrawnSum = buyCoverFee
              .mul(new web3.utils.BN(2))
              .toString();
            const r = await distributor.withdrawETH(
              distributorFeeReceiver,
              withdrawnSum,
              {
                from: coverHolder
              }
            );

            const feeReceiverBalancePostWithdrawal = new web3.utils.BN(
              await web3.eth.getBalance(distributorFeeReceiver)
            );
            const gain = feeReceiverBalancePostWithdrawal.sub(
              feeReceiverBalancePreWithdrawal
            );
            gain.toString().should.be.equal(withdrawnSum);
          });

          it('cover holder should not be able to redeemClaim', async function() {
            await assertRevert(
              distributor.redeemClaim(firstTokenId, {
                from: nftCoverHolder1
              })
            );
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

            await distributor.submitClaim(secondTokenId, {
              from: nftCoverHolder1,
              value: submitClaimDeposit
            });

            coverID = await qd.getAllCoversOfUser(distributor.address);
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

          it('should let claim assessor to vote for claim assessment', async function() {
            await cl.submitCAVote(claimId, 1, {from: member1});
            await cl.submitCAVote(claimId, 1, {from: member2});
            await cl.submitCAVote(claimId, 1, {from: member3});
            await cl.getClaimFromNewStart(0, {from: member1});
            await cl.getClaimFromNewStart(1, {from: member1});
            await cd.getVoteToken(claimId, 0, 1);
            await cd.getVoteVoter(claimId, 1, 1);
            let verdict = await cd.getVoteVerdict(claimId, 1, 1);
            parseFloat(verdict).should.be.equal(1);
          });
          it('should not able to vote after voting closed', async function() {
            const now = await latestTime();
            const maxVotingTime = await cd.maxVotingTime();
            closingTime = new BN(maxVotingTime.toString()).add(
              new BN(now.toString())
            );
            await increaseTimeTo(
              new BN(closingTime.toString()).add(new BN((6).toString()))
            );
            await assertRevert(cl.submitCAVote(claimId, 1, {from: member1}));
          });

          it('should be able to change claim status', async function() {
            const apiCallLength = (await pd.getApilCallLength()) - 1;
            let apiid = await pd.allAPIcall(apiCallLength);

            // let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            priceinEther = await mcr.calculateTokenPrice(CA_ETH);
            await P1.__callback(apiid, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].toString().should.be.equal((7).toString());
            const claimData = await cl.getClaimbyIndex(claimId);

            claimData.finalVerdict.toString().should.be.equal((1).toString());
            claimData.status.toString().should.be.equal((7).toString());
          });

          it('voting should be closed', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((-1).toString());
          });

          it('token should be able to redeem claim', async function() {
            const balancePreRedeem = new web3.utils.BN(
              await web3.eth.getBalance(nftCoverHolder1)
            );
            const redeemClaimsResponse = await distributor.redeemClaim(
              secondTokenId,
              {
                from: nftCoverHolder1
              }
            );
            const logs = Array.from(redeemClaimsResponse.logs);
            const claimRedeemedEvent = logs.filter(
              log => log.event === 'ClaimRedeemed'
            )[0];

            const expectedTotalClaimValue = new web3.utils.BN(
              coverDetails[0]
            ).add(new web3.utils.BN(submitClaimDeposit));

            claimRedeemedEvent.args.receiver.should.be.equal(nftCoverHolder1);
            claimRedeemedEvent.args.value
              .toString()
              .should.be.equal(expectedTotalClaimValue.toString());

            const balancePostRedeem = new web3.utils.BN(
              await web3.eth.getBalance(nftCoverHolder1)
            );

            const tx = await web3.eth.getTransaction(redeemClaimsResponse.tx);
            const gasCost = new web3.utils.BN(tx.gasPrice).mul(
              new web3.utils.BN(redeemClaimsResponse.receipt.gasUsed)
            );
            const balanceGain = balancePostRedeem
              .add(gasCost)
              .sub(balancePreRedeem);

            balanceGain
              .toString()
              .should.be.equal(expectedTotalClaimValue.toString());
          });
        });
      });
    });
  });

  describe('Dai Cover - Member locked Tokens for Claim Assessment', function() {
    describe('Voting is not closed yet', function() {
      describe('CA not voted yet', function() {
        describe('All CAs accept claim', function() {
          before(async function() {
            let now1 = await latestTime();
            await increaseTimeTo(
              new BN(BOOK_TIME.toString()).add(new BN(now1.toString()))
            );

            await cad.transfer(nftCoverHolder1, toWei(2000));

            await cad.approve(distributor.address, buyCoverDaiValue, {
              from: nftCoverHolder1
            });
            coverDetailsDai[4] = 7972408607006;
            var vrsdata = await getQuoteValues(
              coverDetailsDai,
              toHex('DAI'),
              coverPeriod,
              smartConAdd,
              qt.address
            );

            const buyCoverUsingCAResponse = await distributor.buyCoverUsingCA(
              smartConAdd,
              toHex('DAI'),
              coverDetailsDai,
              coverPeriod,
              vrsdata[0],
              vrsdata[1],
              vrsdata[2],
              {from: nftCoverHolder1}
            );

            const tokenId = getCoverDataFromBuyCoverLogs(
              buyCoverUsingCAResponse.logs
            ).tokenId;

            await cad.approve(distributor.address, submitClaimDaiDeposit, {
              from: nftCoverHolder1
            });
            await distributor.submitClaimUsingCA(tokenId, {
              from: nftCoverHolder1
            });

            const minVotingTime = await cd.minVotingTime();
            now2 = await latestTime();
            minTime = new BN(minVotingTime.toString()).add(
              new BN(now2.toString())
            );
            await cl.getClaimFromNewStart(0, {from: member1});
            await cl.getUserClaimByIndex(0, {from: distributor.address});
            await cl.getClaimbyIndex(1, {from: distributor.address});
            claimId = (await cd.actualClaimLength()) - 1;
          });

          it('voting should be open', async function() {
            (await cl.checkVoteClosing(claimId))
              .toString()
              .should.be.equal((0).toString());
          });

          it('should let claim assessor to vote for claim assessment', async function() {
            await cl.submitCAVote(claimId, 1, {from: member1});
            await cl.submitCAVote(claimId, 1, {from: member2});
            await cl.submitCAVote(claimId, 1, {from: member3});
            await cl.getClaimFromNewStart(0, {from: member1});
            await cl.getClaimFromNewStart(1, {from: member1});
            await cd.getVoteToken(claimId, 0, 1);
            await cd.getVoteVoter(claimId, 1, 1);
            let verdict = await cd.getVoteVerdict(claimId, 1, 1);
            parseFloat(verdict).should.be.equal(1);
          });
          it('should not able to vote after voting closed', async function() {
            const now = await latestTime();
            const maxVotingTime = await cd.maxVotingTime();
            closingTime = new BN(maxVotingTime.toString()).add(
              new BN(now.toString())
            );
            await increaseTimeTo(
              new BN(closingTime.toString()).add(new BN((6).toString()))
            );

            await assertRevert(cl.submitCAVote(claimId, 1, {from: member1}));
          });
          it('orcalise call should be able to change claim status', async function() {
            const oldClaimStatus = await cd.getClaimStatusNumber(claimId);
            let apiid = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
            priceinEther = await mcr.calculateTokenPrice(CA_ETH);
            await P1.__callback(apiid, '');
            const newCStatus = await cd.getClaimStatusNumber(claimId);
            newCStatus[1].toString().should.be.equal((12).toString());
          });

          it('should be able to withdraw DAI fee from all bought covers', async function() {
            const feeReceiverBalancePreWithdrawal = new web3.utils.BN(
              await cad.balanceOf(distributorFeeReceiver)
            );
            // 1 cover were bought
            const withdrawnSum = buyCoverDaiFee.toString();
            const r = await distributor.withdrawDAI(
              distributorFeeReceiver,
              withdrawnSum,
              {
                from: coverHolder
              }
            );

            const feeReceiverBalancePostWithdrawal = new web3.utils.BN(
              await cad.balanceOf(distributorFeeReceiver)
            );
            const gain = feeReceiverBalancePostWithdrawal.sub(
              feeReceiverBalancePreWithdrawal
            );

            gain.toString().should.be.equal(withdrawnSum);
          });

          // it(' voting should be closed', async function() {
          //   (await cl.checkVoteClosing(claimId))
          //     .toString()
          //     .should.be.equal((-1).toString());
          // });
        });
      });
    });
  });
});
