const Pool1 = artifacts.require('Pool1Mock');
const Pool2 = artifacts.require('Pool2');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('MockDAI');
const MCR = artifacts.require('MCR');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('GovernanceMock');
const NXMaster = artifacts.require('NXMaster');
const PoolData = artifacts.require('PoolData');
const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const expectEvent = require('./utils/expectEvent');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const NPNAME = '0x5443000000000000';
const NPHASH = 'Test Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const nullAddress = '0x0000000000000000000000000000000000000000';
const coverPeriod = 61;
const coverPeriodLess = 50;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const coverDetailsLess = [
  5,
  19671964915000000,
  20000000000000000000,
  3549627424
];
const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const vrs = [
  28,
  '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a',
  '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff'
];
const vrsLess = [
  27,
  '0x22d150b6e2d3f9ae98c67425d1224c87aed5f853487252875118352771b3ece2',
  '0x0fb3f18fc2b8a74083b3cf8ca24bcf877a397836bd4fa1aba4c3ae96ca92873b'
];
const vrs_dai = [
  27,
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556',
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff'
];
let P1;
let P2;
let pd;
let cr;
let tk;
let tf;
let tc;
let td;
let qd;
let qt;
let cad;
let mcr;
let mcrd;
let mr;
let nxms;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Quotation', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  member5,
  notMember,
  newMember1,
  newMember2,
  newMember3,
  newMember4,
  newMember5,
  newMember6
]) {
  const BN_100 = new BigNumber(100);
  const BN_10 = new BigNumber(10);
  const P_18 = new BigNumber(1e18);
  const tokens = ether(200);
  const tokenAmount = ether(1);
  const tokenDai = ether(4);
  const stakeTokens = ether(2);
  const UNLIMITED_ALLOWANCE = new BigNumber(2).pow(256).minus(1);

  before(async function() {
    await advanceBlock();
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    P2 = await Pool2.deployed();
    pd = await PoolData.deployed();
    qt = await Quotation.deployed();
    cad = await DAI.deployed();
    mcr = await MCR.deployed();
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress('TC'));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    // await mr.payJoiningFee(owner, {
    //   from: owner,
    //   value: fee
    // });
    // await mr.kycVerdict(owner, true);
  });
  describe('Initial cap not reached', function() {
    it('6.1 should revert while buying cover', async function() {
      await mr.payJoiningFee(newMember6, {
        from: newMember6,
        value: fee
      });
      await mr.kycVerdict(newMember6, true);
      await assertRevert(
        P1.makeCoverBegin(
          smartConAdd,
          'ETH',
          coverDetails,
          coverPeriod,
          vrs[0],
          vrs[1],
          vrs[2],
          { from: newMember6, value: coverDetails[1] }
        )
      );
    });

    it('6.2 should return 1 if 100% mcr reached within 30 days of launch', async function() {
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
  });
  describe('Cover Purchase', function() {
    describe('Details', function() {
      it('6.3 should return correct AuthQuoteEngine address', async function() {
        const authQE = await qd.getAuthQuoteEngine();
        authQE.should.equal(QE);
      });
      it('6.4 should return correct Product Details', async function() {
        const productDetails = await qd.getProductDetails();
        parseFloat(productDetails[0]).should.equal(30);
        parseFloat(productDetails[1]).should.equal(30);
        parseFloat(productDetails[2]).should.equal(100);
        parseFloat(productDetails[3]).should.equal(90);
      });
    });

    describe('If user is a member', function() {
      before(async function() {
        await mr.payJoiningFee(member1, { from: member1, value: fee });
        await mr.kycVerdict(member1, true);
        await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
      });

      describe('If user does not have sufficient funds', function() {
        it('6.5 reverts', async function() {
          await assertRevert(
            P1.makeCoverBegin(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: member1, value: coverDetails[1] - 1 }
            )
          );
          await assertRevert(
            qt.makeCoverUsingNXMTokens(
              coverDetails,
              coverPeriod,
              'ETH',
              smartConAdd,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: member1 }
            )
          );
          await assertRevert(
            P1.makeCoverUsingCA(
              smartConAdd,
              'DAI',
              coverDetailsDai,
              coverPeriod,
              vrs_dai[0],
              vrs_dai[1],
              vrs_dai[2],
              { from: member1 }
            )
          );
        });
      });

      describe('If user does have sufficient funds', function() {
        describe('If staker not staked tokens on Smart Contract', function() {
          describe('Purchase Cover With Ether', function() {
            const coverHolder = member3;
            before(async function() {
              await mr.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await mr.kycVerdict(coverHolder, true);
              await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
                from: coverHolder
              });
              await tk.transfer(coverHolder, tokens);
            });
            it('6.6 should not have locked Cover Note initially', async function() {
              const initialLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('6.7 total sum assured should be 0 ETH initially', async function() {
              const initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(0);
            });
            it('6.8 should not be able to purchase cover if premiumNXM is 0', async function() {
              initialTotalSupply = (await tk.totalSupply()).div(P_18);
              let premiumNXM = coverDetails[2];

              // coverDetails[2](premiumNXM) is 0 (refer TokenFunctions.sol)
              coverDetails[2] = 0;
              await assertRevert(
                P1.makeCoverBegin(
                  smartConAdd,
                  'ETH',
                  coverDetails,
                  coverPeriod,
                  vrs[0],
                  vrs[1],
                  vrs[2],
                  { from: coverHolder, value: coverDetails[1] }
                )
              );

              coverDetails[2] = premiumNXM; // restore the value
            });
            it('6.9 should be able to purchase cover', async function() {
              const initialPoolBalance = await web3.eth.getBalance(P1.address);
              const initialTokensOfCoverHolder = await tk.balanceOf(
                coverHolder
              );
              initialTotalSupply = (await tk.totalSupply()).div(P_18);
              await P1.makeCoverBegin(
                smartConAdd,
                'ETH',
                coverDetails,
                coverPeriod,
                vrs[0],
                vrs[1],
                vrs[2],
                { from: coverHolder, value: coverDetails[1] }
              );
              const newLockedCN = BN_10.times(coverDetails[2]).div(BN_100);
              const newPoolBalance = initialPoolBalance.plus(
                new BigNumber(coverDetails[1].toString())
              );
              const newTotalSA = new BigNumber(coverDetails[0]);
              const newTotalSupply = initialTotalSupply
                .plus(newLockedCN.div(P_18))
                .toFixed(0);
              newLockedCN
                .toFixed(0)
                .should.be.bignumber.equal(
                  await tf.getUserLockedCNTokens.call(coverHolder, 1)
                );
              newPoolBalance.should.be.bignumber.equal(
                await web3.eth.getBalance(P1.address)
              );
              newTotalSA.should.be.bignumber.equal(
                await qd.getTotalSumAssured(CA_ETH)
              );
              (await tk.balanceOf(coverHolder)).should.be.bignumber.equal(
                initialTokensOfCoverHolder
              );
              newTotalSupply.should.be.bignumber.equal(
                (await tk.totalSupply()).div(P_18).toFixed(0)
              );
            });
            it('6.10 should be revert if smart contract address is null', async function() {
              await assertRevert(
                P1.makeCoverBegin(
                  nullAddress,
                  'ETH',
                  coverDetails,
                  coverPeriod,
                  vrs[0],
                  vrs[1],
                  vrs[2],
                  { from: coverHolder, value: coverDetails[1] }
                )
              );
            });
            it('6.11 should return correct cover details', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              if (
                cdetails1[3] == CA_ETH &&
                cdetails1[1] == coverHolder &&
                cdetails1[2] == smartConAdd
              ) {
                checkd = true;
              }
              checkd.should.equal(true);
            });
          });

          describe('Purchase Cover With NXM', function() {
            const coverHolder = member4;
            let initialTotalSA;
            before(async function() {
              await mr.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await mr.kycVerdict(coverHolder, true);
              await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
                from: coverHolder
              });
              await tk.transfer(coverHolder, tokens);
            });
            it('6.12 should not have locked Cover Note initially', async function() {
              const initialLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('6.13 total sum assured should be 1 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(1);
            });
            it('6.14 should be able to purchase cover', async function() {
              const initialTokensOfCoverHolder = await tk.balanceOf(
                coverHolder
              );
              initialTotalSupply = (await tk.totalSupply()).div(P_18);
              await qt.makeCoverUsingNXMTokens(
                coverDetails,
                coverPeriod,
                'ETH',
                smartConAdd,
                vrs[0],
                vrs[1],
                vrs[2],
                { from: coverHolder }
              );
              const newLockedCN = BN_10.times(coverDetails[2]).div(BN_100);
              const newTotalSA = initialTotalSA.plus(
                new BigNumber(coverDetails[0])
              );
              const newTokensOfCoverHolder = initialTokensOfCoverHolder.minus(
                coverDetails[2]
              );
              const newTotalSupply = initialTotalSupply
                .plus(newLockedCN.div(P_18))
                .toFixed(0);
              newLockedCN
                .toFixed(0)
                .should.be.bignumber.equal(
                  await tf.getUserAllLockedCNTokens.call(coverHolder)
                );
              newTotalSA.should.be.bignumber.equal(
                await qd.getTotalSumAssured(CA_ETH)
              );
              newTokensOfCoverHolder
                .toFixed(0)
                .should.be.bignumber.equal(await tk.balanceOf(coverHolder));
              newTotalSupply.should.be.bignumber.equal(
                (await tk.totalSupply())
                  .div(P_18)
                  .plus(1)
                  .toFixed(0)
              );
            });
            it('6.15 should return correct cover details', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              if (
                cdetails1[3] == CA_ETH &&
                cdetails1[1] == coverHolder &&
                cdetails1[2] == smartConAdd
              ) {
                checkd = true;
              }
              checkd.should.equal(true);
            });
          });

          describe('Purchase Cover With DAI', function() {
            const coverHolder = member5;
            let initialTotalSA;
            let initialPoolBalanceOfCA;
            before(async function() {
              await mr.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await mr.kycVerdict(coverHolder, true);
              await P1.buyToken({
                from: coverHolder,
                value: tokenAmount
              });
              await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
                from: coverHolder
              });
              await cad.transfer(coverHolder, tokenDai);
            });
            it('6.16 should not have locked Cover Note initially', async function() {
              const initialLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('6.17 total sum assured should be 2 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(2);
            });
            it('6.18 should able to purchase cover using currency assest i.e. DAI ', async function() {
              const initialCAbalance = await cad.balanceOf(coverHolder);
              initialPoolBalanceOfCA = await cad.balanceOf(P1.address);
              const initialTotalSupply = await tk.totalSupply();
              await cad.approve(P1.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                smartConAdd,
                'DAI',
                coverDetailsDai,
                coverPeriod,
                vrs_dai[0],
                vrs_dai[1],
                vrs_dai[2],
                { from: coverHolder }
              );
              const presentLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              const presentCAbalance = await cad.balanceOf(coverHolder);
              const presentTotalSupply = await tk.totalSupply();
              const newLockedCN = BN_10.times(
                new BigNumber(coverDetailsDai[2].toString()).div(BN_100)
              ).toFixed(0);
              const newTotalSupply = initialTotalSupply.plus(
                new BigNumber(newLockedCN)
              );
              presentCAbalance.should.be.bignumber.equal(
                initialCAbalance.minus(
                  new BigNumber(coverDetailsDai[1].toString())
                )
              );
              newLockedCN.should.be.bignumber.equal(presentLockedCN);
              newTotalSupply.should.be.bignumber.equal(presentTotalSupply);
            });
            it('6.19 currency assest balance should increase after cover purchase', async function() {
              const presentPoolBalanceOfCA = new BigNumber(
                coverDetailsDai[1].toString()
              );
              (await cad.balanceOf(P1.address)).should.be.bignumber.equal(
                initialPoolBalanceOfCA.plus(presentPoolBalanceOfCA)
              );
            });
            it('6.20 should return correct cover details purchased with DAI', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              if (
                cdetails1[3] == CA_DAI &&
                cdetails1[1] == coverHolder &&
                cdetails1[2] == smartConAdd
              ) {
                checkd = true;
              }
              checkd.should.equal(true);
            });
          });
        });

        describe('If staker staked tokens on Smart Contract', function() {
          const staker1 = member1;
          const staker2 = member2;
          let event;
          before(async function() {
            await mr.payJoiningFee(staker2, {
              from: staker2,
              value: fee
            });
            await mr.kycVerdict(staker2, true);
            await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
              from: staker2
            });
            await tk.transfer(staker2, tokens);
            await tk.transfer(staker1, tokens);
            await tk.transfer(staker2, tokens);
            await tf.addStake(smartConAdd, stakeTokens, {
              from: staker1
            });

            await tf.addStake(smartConAdd, stakeTokens, {
              from: staker2
            });
          });

          describe('Purchase Cover With Ether', function() {
            const coverHolder = member3;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('6.21 should be able to purchase cover ', async function() {
              initialStakeCommissionOfS1 = await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              );
              initialStakeCommissionOfS2 = await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              );
              await P1.makeCoverBegin(
                smartConAdd,
                'ETH',
                coverDetails,
                coverPeriod,
                vrs[0],
                vrs[1],
                vrs[2],
                { from: coverHolder, value: coverDetails[1] }
              );
            });

            it('6.22 staker gets commission', async function() {
              const commission =
                (coverDetails[2] * (await td.stakerCommissionPer())) / 100 - 1;
              (await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              )).should.be.bignumber.equal(
                initialStakeCommissionOfS1.plus(commission.toFixed(0))
              );

              (await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              )).should.be.bignumber.equal(initialStakeCommissionOfS2);
            });
          });

          describe('Purchase Cover With NXM', function() {
            const coverHolder = member4;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('6.23 should be able to purchase cover', async function() {
              initialStakeCommissionOfS1 = await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              );
              initialStakeCommissionOfS2 = await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              );
              let newCDetails = coverDetails.slice();
              newCDetails[3] = (await latestTime()) - 2;
              await assertRevert(
                qt.makeCoverUsingNXMTokens(
                  newCDetails,
                  coverPeriod,
                  'ETH',
                  smartConAdd,
                  vrs[0],
                  vrs[1],
                  vrs[2],
                  { from: coverHolder }
                )
              );
              await assertRevert(
                qt.makeCoverUsingNXMTokens(
                  coverDetails,
                  coverPeriod,
                  'ETH',
                  smartConAdd,
                  27,
                  vrs[1],
                  vrs[2],
                  { from: coverHolder }
                )
              );
              await qt.makeCoverUsingNXMTokens(
                coverDetails,
                coverPeriod,
                'ETH',
                smartConAdd,
                vrs[0],
                vrs[1],
                vrs[2],
                { from: coverHolder }
              );
            });
            it('6.24 staker gets commission', async function() {
              const commission =
                (coverDetails[2] * (await td.stakerCommissionPer())) / 100 - 1;
              (await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              )).should.be.bignumber.equal(
                initialStakeCommissionOfS1.plus(commission.toFixed(0))
              );

              (await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              )).should.be.bignumber.equal(initialStakeCommissionOfS2);
            });
          });

          describe('Purchase Cover With DAI', function() {
            const coverHolder = member5;
            let initialPoolBalanceOfCA;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('6.25 should able to purchase cover using currency assest i.e. DAI ', async function() {
              initialStakeCommissionOfS1 = await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              );
              initialStakeCommissionOfS2 = await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              );
              await cad.approve(P1.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                smartConAdd,
                'DAI',
                coverDetailsDai,
                coverPeriod,
                vrs_dai[0],
                vrs_dai[1],
                vrs_dai[2],
                { from: coverHolder }
              );
            });
            it('6.26 staker gets commission', async function() {
              const commission =
                (coverDetailsDai[2] * (await td.stakerCommissionPer())) / 100 -
                1;
              (await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              )).should.be.bignumber.equal(
                initialStakeCommissionOfS1.plus(commission.toFixed(0))
              );
              (await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              )).should.be.bignumber.equal(initialStakeCommissionOfS2);
            });
            it('6.27 should able to purchase cover with cover period less than 60 ', async function() {
              let coverLen = await qd.getCoverLength();
              let totalSASC = await qd.getTotalSumAssuredSC(smartConAdd, 'DAI');
              await cad.approve(P1.address, coverDetailsLess[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                smartConAdd,
                'DAI',
                coverDetailsLess,
                coverPeriodLess,
                vrsLess[0],
                vrsLess[1],
                vrsLess[2],
                { from: coverHolder }
              );
              coverLen
                .plus(1)
                .should.be.bignumber.equal(await qd.getCoverLength());
              coverPeriodLess.should.be.bignumber.equal(
                await qd.getCoverPeriod((await qd.getCoverLength()) - 1)
              );
              totalSASC
                .plus(coverDetailsLess[0])
                .should.be.bignumber.equal(
                  await qd.getTotalSumAssuredSC(smartConAdd, 'DAI')
                );
            });
          });
        });
      });
    });

    describe('If user is not a member', function() {
      it('6.28 should return -1 if user have no holded Covers', async function() {
        let holdedId = await qt.getRecentHoldedCoverIdStatus(member1);
        holdedId.should.be.bignumber.equal(-1);
      });
      it('6.29 should revert if member', async function() {
        const totalFee = fee.plus(coverDetails[1].toString());
        await assertRevert(
          qt.initiateMembershipAndCover(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            vrs[0],
            vrs[1],
            vrs[2],
            { from: member1, value: totalFee }
          )
        );
      });
      describe('if do not want to join membership', function() {
        it('6.30 reverts', async function() {
          await assertRevert(
            P1.makeCoverBegin(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: notMember, value: coverDetails[1] }
            )
          );

          await assertRevert(
            qt.makeCoverUsingNXMTokens(
              coverDetails,
              coverPeriod,
              'ETH',
              smartConAdd,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: notMember }
            )
          );
          await assertRevert(
            P1.makeCoverUsingCA(
              smartConAdd,
              'DAI',
              coverDetailsDai,
              coverPeriod,
              vrs_dai[0],
              vrs_dai[1],
              vrs_dai[2],
              { from: notMember }
            )
          );
          const totalFee = fee.plus(coverDetails[1].toString());
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: notMember, value: 1 }
            )
          );
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              27,
              vrs[1],
              vrs[2],
              { from: notMember, value: totalFee }
            )
          );
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            vrs[0],
            vrs[1],
            vrs[2],
            { from: notMember, value: totalFee }
          );
          await cad.transfer(qt.address, 10 * 1e18);
          let newQt = await Quotation.new();
          let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
          let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
          actionHash = encode(
            'upgradeContract(bytes2,address)',
            'QT',
            newQt.address
          );
          await gvProp(29, actionHash, oldMR, oldGv, 2);
          (await nxms.getLatestAddress('QT')).should.be.equal(newQt.address);
          qt = newQt;
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: notMember, value: totalFee }
            )
          );
          let hcl = await qd.getUserHoldedCoverLength(notMember);
          await qt.kycVerdict(false, notMember);
        });
      });
      describe('if want to join membership', function() {
        it('6.31 should be able to join membership and purchase cover with ETH', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember1
          });
          const totalFee = fee.plus(coverDetails[1].toString());
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            vrs[0],
            vrs[1],
            vrs[2],
            { from: newMember1, value: totalFee }
          );
          let holdedId = await qt.getRecentHoldedCoverIdStatus(newMember1);
          holdedId.should.be.bignumber.above(0);
          await qt.kycVerdict(true, newMember1);
        });
        it('6.32 should be able to join membership and purchase cover with DAI', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember2
          });
          await cad.transfer(newMember2, tokenDai);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: newMember2
          });
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'DAI',
            coverDetailsDai,
            coverPeriod,
            vrs_dai[0],
            vrs_dai[1],
            vrs_dai[2],
            { from: newMember2, value: fee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember2, 0);
          await qt.kycVerdict(true, newMember2);
        });
        it('6.33 should refund full amount if user aks (DAI)', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember3
          });
          await cad.transfer(newMember3, tokenDai);
          let initialDAI = await cad.balanceOf(member3);
          await cad.approve(qt.address, coverDetailsLess[1], {
            from: newMember3
          });
          const totalFee = fee;
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'DAI',
            coverDetailsLess,
            coverPeriodLess,
            vrsLess[0],
            vrsLess[1],
            vrsLess[2],
            { from: newMember3, value: totalFee }
          );
          await qt.fullRefund({ from: newMember3 });
          initialDAI.should.be.bignumber.equal(await cad.balanceOf(member3));
        });
        it('6.34 should refund full amount to new member', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember3
          });
          const totalFee = fee.plus(coverDetails[1].toString());
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            vrs[0],
            vrs[1],
            vrs[2],
            { from: newMember3, value: totalFee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember3, 0);
          await assertRevert(qt.fullRefund({ from: owner }));
          await qt.fullRefund({ from: newMember3 });
          await assertRevert(qt.kycVerdict(true, newMember3));
        });

        it('6.34.2 should revert if wallet address is not set', async function() {
          let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
          let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
          actionHash = encode(
            'updateOwnerParameters(bytes8,address)',
            'MSWALLET',
            nullAddress
          );
          await gvProp(28, actionHash, oldMR, oldGv, 3);
          (await td.walletAddress()).should.be.equal(nullAddress);
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember5
          });
          const totalFee = fee.plus(coverDetails[1].toString());
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            vrs[0],
            vrs[1],
            vrs[2],
            { from: newMember5, value: totalFee }
          );
          await assertRevert(qt.kycVerdict(true, newMember5));
          actionHash = encode(
            'updateOwnerParameters(bytes8,address)',
            'MSWALLET',
            owner
          );
          await gvProp(28, actionHash, oldMR, oldGv, 3);
          (await td.walletAddress()).should.be.equal(owner);
        });

        it('6.35 should get membership but not cover if quote expires for ETH', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember4
          });
          const totalFee = fee.plus(coverDetails[1].toString());
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            vrs[0],
            vrs[1],
            vrs[2],
            { from: newMember4, value: totalFee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember4, 0);
          const newCoverDetails = coverDetails.slice();
          newCoverDetails[3] = (await latestTime()) - 3;
          await qd.changeHoldedCoverDetails(hcid, newCoverDetails);
          await qt.kycVerdict(true, newMember4);
        });

        it('6.36 should revert if quote validity expires', async function() {
          const newCoverDetails = coverDetails.slice();
          const validity = await latestTime();
          newCoverDetails[3] = validity - 2;
          const totalFee = fee.plus(newCoverDetails[1].toString());
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              'ETH',
              newCoverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              { from: notMember, value: totalFee }
            )
          );
        });

        it('6.37 should get membership but not cover if quote expires for DAI', async function() {
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              'DAI',
              coverDetailsDai,
              coverPeriod,
              vrs_dai[0],
              vrs_dai[1],
              vrs_dai[2],
              { from: notMember, value: fee }
            )
          );

          await cad.transfer(notMember, coverDetailsDai[1]);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: notMember
          });
          await qt.initiateMembershipAndCover(
            smartConAdd,
            'DAI',
            coverDetailsDai,
            coverPeriod,
            vrs_dai[0],
            vrs_dai[1],
            vrs_dai[2],
            { from: notMember, value: fee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(notMember, 1);
          const newCoverDetails = coverDetailsDai.slice();
          newCoverDetails[3] = (await latestTime()) - 3;
          await qd.changeHoldedCoverDetails(hcid, newCoverDetails);
          await qt.kycVerdict(true, notMember);
        });
      });
    });
  });

  describe('Cover Expire', function() {
    let initialSumAssured;
    let initialTokenBalance;
    let validityofCover;
    before(async function() {
      initialTokenBalance = await tk.balanceOf(member3);
      validityofCover = await qd.getValidityOfCover(1);
    });
    it('6.38 cover should not expired before validity', async function() {
      (await qt.checkCoverExpired(1)).should.be.equal(false);
      await increaseTimeTo(validityofCover.plus(1));
    });

    it('6.39 cover should be expired after validity expires', async function() {
      initialSumAssured = await qd.getTotalSumAssured(CA_ETH);
      await qt.expireCover(1);
      (await qt.checkCoverExpired(1)).should.be.equal(true);
    });

    it('6.40 Expired cover should not be expired again', async function() {
      await assertRevert(qt.expireCover(1));
    });

    it('6.41 decrease sum assured', async function() {
      const newSumAssured = await qd.getTotalSumAssured(CA_ETH);
      newSumAssured.should.be.bignumber.equal(initialSumAssured.minus(1));
    });
    it('6.42 should change cover status', async function() {
      (await qd.getCoverStatusNo(1)).should.be.bignumber.equal(3);
    });
    it('6.43 should unlock locked cover note tokens', async function() {
      const unLockedCN = BN_10.times(coverDetails[2])
        .div(BN_100)
        .toFixed(0);
      (await tk.balanceOf(member3)).should.be.bignumber.equal(
        initialTokenBalance.plus(unLockedCN)
      );
    });
  });

  describe('Misc', function() {
    describe('Change product params if owner', function() {
      it('6.47 only governance call should be able to change Profit Margin', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        actionHash = encode('updateUintParameters(bytes8,uint)', 'PM', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.pm()) / 1).should.be.equal(4);
      });
      it('6.48 only governance call should be able to change STLP', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        actionHash = encode('updateUintParameters(bytes8,uint)', 'STLP', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.stlp()) / 1).should.be.equal(4);
      });
      it('6.49 only governance call should be able to change STL', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        actionHash = encode('updateUintParameters(bytes8,uint)', 'STL', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.stl()) / 1).should.be.equal(4);
      });
      it('6.50 only governance call should be able to change minimum cover period', async function() {
        let oldMR = await MemberRoles.at(await nxms.getLatestAddress('MR'));
        let oldGv = await Governance.at(await nxms.getLatestAddress('GV'));
        actionHash = encode('updateUintParameters(bytes8,uint)', 'QUOMIND', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.minDays()) / 1).should.be.equal(4);
      });
    });
    describe('if not internal contract address', function() {
      it('6.51 should not be able to change master address', async function() {
        await assertRevert(
          qd.changeMasterAddress(qd.address, { from: notMember })
        );
        await assertRevert(
          qt.changeMasterAddress(qd.address, { from: notMember })
        );
      });
      it('6.52 should not be able to change cover status number', async function() {
        const CID = await qd.getAllCoversOfUser(member3);
        await assertRevert(
          qd.changeCoverStatusNo(CID[0], 1, { from: notMember })
        );
      });
      it('6.53 should fail add mcr if lower threshold not reached', async function() {
        await mcr.addMCRData(
          0,
          100 * 1e18,
          2 * 1e18,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
        (await pd.getApiIdTypeOf(APIID)).should.be.equal('0x4d435246');
      });
      it('6.54 should throw if call kycVerdict with non authorised address', async function() {
        await assertRevert(qt.kycVerdict(true, member1, { from: member1 }));
      });
      it('6.54 should not able to update quoatation parameters directly', async function() {
        await assertRevert(qd.updateUintParameters('STLP', 1));
      });
    });
  });
});
