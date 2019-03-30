const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const PoolData = artifacts.require('PoolData');
const NXMToken = artifacts.require('NXMToken');
const TokenController = artifacts.require('TokenController');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenData = artifacts.require('TokenDataMock');
const Claims = artifacts.require('Claims');
const ClaimsData = artifacts.require('ClaimsData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('MockDAI');
const NXMaster = artifacts.require('NXMaster');
const MemberRoles = artifacts.require('MemberRoles');
const MCR = artifacts.require('MCR');
const Governance = artifacts.require('GovernanceMock');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;

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
  notMember,
  govVoter1,
  govVoter2,
  govVoter3,
  govVoter4
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
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
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
    // await mr.payJoiningFee(web3.eth.accounts[0], {
    //   from: web3.eth.accounts[0],
    //   value: fee
    // });
    // await mr.kycVerdict(web3.eth.accounts[0], true);
    for (let itr = 7; itr < 11; itr++) {
      await mr.payJoiningFee(web3.eth.accounts[itr], {
        from: web3.eth.accounts[itr],
        value: fee
      });
      await mr.kycVerdict(web3.eth.accounts[itr], true);
      let isMember = await nxms.isMember(web3.eth.accounts[itr]);
      isMember.should.equal(true);

      await tk.transfer(web3.eth.accounts[itr], 275000000000000000000000);
    }
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
        it('7.1 reverts', async function() {
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
              it('7.2 should be able to submit claim', async function() {
                coverID = await qd.getAllCoversOfUser(coverHolder);
                coverCurr = await qd.getCurrencyOfCover(coverID[0]);
                initialCurrencyAssetVarMin = await pd.getCurrencyAssetVarMin(
                  coverCurr
                );
                await P1.transferFundToOtherAdd(owner, 5 * 1e18); // To check insufficientTrade condition

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
              });
              it('7.3 cover status should change', async function() {
                const claimDetails = await cd.getAllClaimsByIndex(1);
                claimDetails[0].should.be.bignumber.equal(coverID[0]);
                const newCoverStatus = await qd.getCoverStatusNo(coverID[0]);
                newCoverStatus.should.be.bignumber.equal(4);
              });
              it('7.4 should increase CurrencyAssetVarMin', async function() {
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
              it('7.5 reverts', async function() {
                const coverID = await qd.getAllCoversOfUser(coverHolder);
                await assertRevert(
                  cl.submitClaim(coverID[0], { from: coverHolder })
                );
              });
            });
          });

          // describe('if claim is already accepted', function() {
          //   const newCoverHolder = member4;
          //   before(async function() {
          //     await P1.makeCoverBegin(
          //       smartConAdd,
          //       'ETH',
          //       coverDetails,
          //       coverPeriod,
          //       v,
          //       r,
          //       s,
          //       { from: newCoverHolder, value: coverDetails[1] }
          //     );
          //     const coverID = await qd.getAllCoversOfUser(newCoverHolder);
          //     await cl.submitClaim(coverID[0], { from: newCoverHolder });
          //     const claimId = (await cd.actualClaimLength()) - 1;
          //     // await cl.setClaimStatus(claimId, 1);
          //   });
          // });

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
              await P1.__callback(APIID, '');
            });
            it('7.7 reverts', async function() {
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
          it('7.8 reverts', async function() {
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
    describe('owner address', function() {
      it('7.16 should be able to propose new minTime voting', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        let actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          'CAMINVT',
          0
        );
        await gvProp(24, actionHash, oldMR, oldGv, 2);
        let val = await cd.getUintParameters('CAMINVT');
        (val[1] / 1).should.be.equal(0);
      });
      it('7.17 should be able to propose new max voting Time', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        let actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          'CAMAXVT',
          10
        );
        await gvProp(24, actionHash, oldMR, oldGv, 2);
        let val = await cd.getUintParameters('CAMAXVT');
        (val[1] / 1).should.be.equal(10);
      });
      it('7.18 should be able to propose new Payout retry time', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        let actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          'CAPRETRY',
          120
        );
        await gvProp(24, actionHash, oldMR, oldGv, 2);
        let val = await cd.getUintParameters('CAPRETRY');
        (val[1] / 1).should.be.equal(120);
      });
      it('7.21 should be able to propose new claim deposit time', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        let actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          'CADEPT',
          12
        );
        await gvProp(24, actionHash, oldMR, oldGv, 2);
        let val = await cd.getUintParameters('CADEPT');
        (val[1] / 1).should.be.equal(12);
      });

      it('7.22 should be able to propose new claim reward percentage', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        let actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          'CAREWPER',
          36
        );
        await gvProp(24, actionHash, oldMR, oldGv, 2);
        ((await cd.claimRewardPerc()) / 1).should.be.equal(36);
      });
      it('7.23 should revert if trying to update pendingClaimStart with low value', async function() {
        await assertRevert(
          P1.setpendingClaimStart((await cd.pendingClaimStart()) - 1)
        );
      });
    });
  });
});
