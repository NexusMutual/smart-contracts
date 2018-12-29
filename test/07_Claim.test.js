const Pool1 = artifacts.require('Pool1Mock');
const PoolData = artifacts.require('PoolData');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenData = artifacts.require('TokenData');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const CLA = '0x434c41';
const CA_ETH = '0x455448';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

let tk;
let tf;
let tc;
let td;
let P1;
let P3;
let cr;
let cl;
let qd;
let qt;
let cad;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Claim', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  notCoverHolder,
  notMember
]) {
  const P_18 = new BigNumber(1e18);
  const stakeTokens = ether(2);
  const tokens = ether(200);
  const validity = duration.days(30);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);

  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    tc = await TokenController.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    cl = await Claims.deployed();
    cd = await ClaimsData.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
  });
  describe('Submit Claim', function() {
    before(async function() {
      await tf.payJoiningFee(member1, { from: member1, value: fee });
      await tf.kycVerdict(member1, true);
      await tf.payJoiningFee(member2, { from: member2, value: fee });
      await tf.kycVerdict(member2, true);
      await tf.payJoiningFee(member3, { from: member3, value: fee });
      await tf.kycVerdict(member3, true);
      await tf.payJoiningFee(member4, { from: member4, value: fee });
      await tf.kycVerdict(member4, true);
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member2 });
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member3 });
      await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member4 });
      await tk.transfer(member1, tokens);
      await tk.transfer(member2, tokens);
      await tk.transfer(member3, tokens);
      await tk.transfer(member4, tokens);
      await tf.addStake(smartConAdd, stakeTokens, { from: member1 });
      await tf.addStake(smartConAdd, stakeTokens, { from: member2 });
      await tf.addStake(smartConAdd, stakeTokens, { from: member3 });
    });

    describe('if member', function() {
      let coverHolder = member1;
      describe('if does not purchased cover', function() {
        it('reverts', async function() {
          await assertRevert(cl.submitClaim(0, { from: member1 }));
        });
      });

      describe('if holds a cover', function() {
        before(async function() {
          await P1.makeCoverBegin(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            v,
            r,
            s,
            { from: coverHolder, value: coverDetails[1] }
          );
        });

        describe('if member is cover owner', function() {
          describe('if cover does not expires', function() {
            describe('if claim is not submitted yet', function() {
              let initialCurrencyAssetVarMin;
              let coverID;
              let coverCurr;
              it('should be able to submit claim', async function() {
                coverID = await qd.getAllCoversOfUser(coverHolder);
                coverCurr = await qd.getCurrencyOfCover(coverID[0]);
                initialCurrencyAssetVarMin = await pd.getCurrencyAssetVarMin(
                  coverCurr
                );
                await cl.submitClaim(coverID[0], { from: coverHolder });
              });
              it('cover status should change', async function() {
                const claimDetails = await cd.getAllClaimsByIndex(1);
                claimDetails[0].should.be.bignumber.equal(coverID[0]);
                const newCoverStatus = await qd.getCoverStatusNo(coverID[0]);
                newCoverStatus.should.be.bignumber.equal(4);
              });
              it('should increase CurrencyAssetVarMin', async function() {
                const sumAssured = await qd.getCoverSumAssured(coverID[0]);
                (await pd.getCurrencyAssetVarMin(
                  coverCurr
                )).should.be.bignumber.equal(
                  initialCurrencyAssetVarMin.plus(sumAssured)
                );
              });
            });

            describe('if claim is already submitted', function() {
              it('reverts', async function() {
                const coverID = await qd.getAllCoversOfUser(coverHolder);
                await assertRevert(
                  cl.submitClaim(coverID[0], { from: coverHolder })
                );
              });
            });
          });

          //TODO: fix covernote exhaust test case
          // describe('if claim rejected 2 times', function() {
          //   const newCoverHolder = member4;
          //   let coverID;
          //   before(async function() {
          //     await P1.makeCoverBegin(
          //       PID,
          //       smartConAdd,
          //       'ETH',
          //       coverDetails,
          //       coverPeriod,
          //       v,
          //       r,
          //       s,
          //       { from: newCoverHolder, value: coverDetails[1] }
          //     );
          //     coverID = await qd.getAllCoversOfUser(newCoverHolder);
          //     let i;
          //     let newCStatus;
          //     let claimId;
          //     let closingTime;
          //     let now;

          //     const maxVotingTime = await cd.maxVotingTime();
          //     await tc.lock(CLA, tokens, validity, { from: member1 });
          //     await tc.lock(CLA, tokens, validity, { from: member2 });
          //     await tc.lock(CLA, tokens, validity, { from: member3 });

          //     await cl.submitClaim(coverID[0], { from: newCoverHolder });

          //     for (i = 0; i < 2; i++) {
          //       await P1.buyToken({ from: member1, value: ether(0.7) });
          //       await P1.buyToken({ from: member2, value: ether(0.8) });
          //       await P1.buyToken({ from: member3, value: ether(0.9) });
          //       if (i > 0) {
          //         await nxmtk1.increaseLockAmount(CLA, tokens, {
          //           from: member1
          //         });
          //         await nxmtk1.increaseLockAmount(CLA, tokens, {
          //           from: member2
          //         });
          //         await nxmtk1.increaseLockAmount(CLA, tokens, {
          //           from: member3
          //         });

          //         await cl.submitClaim(coverID[0], { from: newCoverHolder });
          //       }
          //       claimId = (await cd.actualClaimLength()) - 1;
          //       await cl.submitCAVote(claimId, -1, { from: member1 });
          //       await cl.submitCAVote(claimId, -1, { from: member2 });
          //       await cl.submitCAVote(claimId, -1, { from: member3 });
          //       now = await latestTime();
          //       closingTime = maxVotingTime.plus(now);
          //       await increaseTimeTo(closingTime.plus(1));
          //       newCStatus = await cd.getClaimStatusNumber(claimId);
          //       await cr.changeClaimStatus(claimId, { from: owner });
          //     }
          //   });
          //   it('reverts', async function() {
          //     await assertRevert(
          //       cl.submitClaim(coverID[0], { from: newCoverHolder })
          //     );
          //   });
          // });

          describe('if claim is already accepted', function() {
            const newCoverHolder = member4;
            before(async function() {
              await P1.makeCoverBegin(
                smartConAdd,
                'ETH',
                coverDetails,
                coverPeriod,
                v,
                r,
                s,
                { from: newCoverHolder, value: coverDetails[1] }
              );
              const coverID = await qd.getAllCoversOfUser(newCoverHolder);
              await cl.submitClaim(coverID[0], { from: newCoverHolder });
              const claimId = (await cd.actualClaimLength()) - 1;
              await cl.setClaimStatus(claimId, 1);
            });
            it('should not be able to submit claim', async function() {
              const coverID = await qd.getAllCoversOfUser(newCoverHolder);
              await assertRevert(
                cl.submitClaim(coverID[0], { from: newCoverHolder })
              );
            });
          });

          describe('if cover expires', function() {
            let coverID;
            before(async function() {
              await P1.makeCoverBegin(
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
              const validity = await qd.getValidityOfCover(coverID[1]);
              await increaseTimeTo(validity.plus(2));
              qt.expireCover(coverID[1]);
            });
            it('reverts', async function() {
              coverID = await qd.getAllCoversOfUser(coverHolder);
              await assertRevert(
                cl.submitClaim(coverID[1], { from: coverHolder })
              );
            });
          });
        });

        describe('if member is not cover owner', function() {
          before(async function() {
            await qt.makeCoverUsingNXMTokens(
              coverDetails,
              coverPeriod,
              'ETH',
              smartConAdd,
              v,
              r,
              s,
              { from: coverHolder }
            );
          });
          it('reverts', async function() {
            coverID = await qd.getAllCoversOfUser(coverHolder);
            await assertRevert(
              cl.submitClaim(coverID[2], { from: notCoverHolder })
            );
          });
        });
      });
    });
  });

  describe('Misc', function() {
    describe('Not internal contract address', function() {
      it('should not able to changeDependentContractAddress', async function() {
        await assertRevert(
          cl.changeDependentContractAddress({ from: notMember })
        );
      });
      it('should not be able to set minTime voting', async function() {
        await assertRevert(cd.setMinVotingTime(0, { from: notMember }));
      });
      it('should not be able to set max voting Time', async function() {
        await assertRevert(cd.setMaxVotingTime(1, { from: notMember }));
      });
      it('should not be able to set Payout retry time', async function() {
        await assertRevert(cd.setPayoutRetryTime(1, { from: notMember }));
      });
      it('should not be able to start pending claims', async function() {
        await assertRevert(cd.setpendingClaimStart(1, { from: notMember }));
      });
      it('should not be able update claims date', async function() {
        await assertRevert(cd.setClaimDateUpd(0, 1, { from: notMember }));
      });
      it('should not be able to set claim deposit time', async function() {
        await assertRevert(cd.setClaimDepositTime(1, { from: notMember }));
      });
    });

    describe('internal contract address', function() {
      it('should be able to set minTime voting', async function() {
        await cd.setMinVotingTime(0, { from: owner });
      });
      it('should be able to set max voting Time', async function() {
        await cd.setMaxVotingTime(1, { from: owner });
      });
      it('should be able to set Payout retry time', async function() {
        await cd.setPayoutRetryTime(1, { from: owner });
      });
      it('should be able to start pending claims', async function() {
        await cd.setpendingClaimStart(1, { from: owner });
      });
      it('should be able update claims date', async function() {
        await cd.setClaimDateUpd(0, 1, { from: owner });
      });
      it('should be able to set claim deposit time', async function() {
        await cd.setClaimDepositTime(1, { from: owner });
      });
    });
  });
});
