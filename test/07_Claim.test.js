const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenData = artifacts.require('TokenData');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('MockDAI');
const NXMaster = artifacts.require('NXMaster');
const MemberRoles = artifacts.require('MemberRoles');
const MCR = artifacts.require('MCR');

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
let cr;
let cl;
let qd;
let qt;
let cad;
let p2;
let pd;
let nxms;
let mr;
let mcr;

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
    p2 = await Pool2.deployed();
    cad = await DAI.deployed();
    mcr = await MCR.deployed();
    nxms = await NXMaster.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    await mcr.addMCRData(
      18000,
      100 * 1e18,
      2 * 1e18,
      ['0x455448', '0x444149'],
      [100, 65407],
      20181011
    );
    (await pd.capReached()).should.be.bignumber.equal(1);
  });

  describe('Submit Claim', function() {
    before(async function() {
      await mr.payJoiningFee(member1, { from: member1, value: fee });
      await mr.kycVerdict(member1, true);
      await mr.payJoiningFee(member2, { from: member2, value: fee });
      await mr.kycVerdict(member2, true);
      await mr.payJoiningFee(member3, { from: member3, value: fee });
      await mr.kycVerdict(member3, true);
      await mr.payJoiningFee(member4, { from: member4, value: fee });
      await mr.kycVerdict(member4, true);
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
          // console.log('helll');
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
                await P1.transferFundToOtherAdd(owner, 5 * 1e18); // To check insufficientTrade condition
                let CABalE;
                let CABalD;
                let CABalE2;
                let CABalD2;

                CABalE = await web3.eth.getBalance(P1.address);
                CABalE2 = await web3.eth.getBalance(p2.address);
                CABalD = await cad.balanceOf(P1.address);
                CABalD2 = await cad.balanceOf(p2.address);
                let initialUserClaimCount = await cd.getUserClaimCount(
                  coverHolder
                );
                let initialClaimCount = await cd.getClaimLength();
                await cl.submitClaim(coverID[0], { from: coverHolder });
                initialUserClaimCount
                  .add(1)
                  .should.be.bignumber.equal(
                    await cd.getUserClaimCount(coverHolder)
                  );
                initialClaimCount
                  .add(1)
                  .should.be.bignumber.equal(await cd.getClaimLength());
                const CAdetails = await pd.getCurrencyAssetVarBase(coverCurr);
                const rankDetails = await pd.getIARankDetailsByDate(
                  await pd.getLastDate()
                );
                let coverCurrCA;
                if (coverCurr == 0x45544800) coverCurrCA = CABalE;
                else coverCurrCA = CABalD;
                let amount;
                let typeOfTrade = 'noTradeReq';
                if (
                  coverCurrCA >
                  2 * (CAdetails[1].toNumber() + CAdetails[2].toNumber())
                )
                  typeOfTrade = 'ELT';
                if (
                  coverCurrCA <
                  CAdetails[1].toNumber() + CAdetails[2].toNumber()
                )
                  typeOfTrade = 'ILT';
                if (typeOfTrade == 'noTradeReq') amount = 0;
                // if(rankDetails[2] == coverCurr)
                amount =
                  coverCurrCA -
                  (CAdetails[1].toNumber() + CAdetails[2].toNumber()) * 1.5;

                let finalCABalE = await web3.eth.getBalance(P1.address);
                let finalCABalE2 = await web3.eth.getBalance(p2.address);
                let finalCABalD = await cad.balanceOf(P1.address);
                let finalCABalD2 = await cad.balanceOf(p2.address);
                let calCABalE;
                let calCABalE2;
                let calCABalD;
                let calCABalD2;
                if (coverCurr == 0x45544800) {
                  calCABalE = parseFloat(CABalE) - parseFloat(amount);
                  calCABalE2 = parseFloat(CABalE2) + parseFloat(amount);
                  parseFloat(finalCABalE).should.be.equal(
                    parseFloat(calCABalE)
                  );
                  parseFloat(finalCABalE2).should.be.equal(
                    parseFloat(calCABalE2)
                  );
                } else {
                  calCABalD = parseFloat(CABalD) - parseFloat(amount);
                  calCABalD2 = parseFloat(CABalD2) + parseFloat(amount);
                  parseFloat(finalCABalD).should.be.equal(
                    parseFloat(calCABalD)
                  );
                  parseFloat(finalCABalD2).should.be.equal(
                    parseFloat(calCABalD2)
                  );
                }
              });
              it('cover status should change', async function() {
                const claimDetails = await cd.getAllClaimsByIndex(1);
                claimDetails[0].should.be.bignumber.equal(coverID[0]);
                const newCoverStatus = await qd.getCoverStatusNo(coverID[0]);
                newCoverStatus.should.be.bignumber.equal(4);
              });
              it('should increase CurrencyAssetVarMin', async function() {
                const sumAssured = await qd.getCoverSumAssured(coverID[0]);
                // const sumAssured1 =sumAssured.plus(await qd.getCoverSumAssured(coverID[1]));
                (await pd.getCurrencyAssetVarMin(
                  coverCurr
                )).should.be.bignumber.equal(
                  initialCurrencyAssetVarMin.plus(sumAssured.mul(ether(1)))
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
              var APIID = await pd.allAPIcall(
                (await pd.getApilCallLength()) - 1
              );

              const validity = await qd.getValidityOfCover(coverID[1]);
              await increaseTimeTo(validity.plus(2));
              qt.expireCover(coverID[1]);

              APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
              await p2.delegateCallBack(APIID);
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

    describe('owner address', function() {
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

      it('should be able to set claim reward percentage', async function() {
        await cd.setClaimRewardPerc(20, { from: owner });
      });
    });
  });
});
