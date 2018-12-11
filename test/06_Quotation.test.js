const Pool1 = artifacts.require('Pool1');
const Pool2 = artifacts.require('Pool2');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctions');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenData');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('MockDAI');
const MCRDataMock = artifacts.require('MCRDataMock');
const MCR = artifacts.require('MCR');
const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const { increaseTimeTo } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const expectEvent = require('./utils/expectEvent');

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
const coverPeriod = 61;
const coverPeriodLess = 40;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const coverDetailsLess = [
  3,
  68336755646817250,
  6047500499718341000,
  4131417584
];
const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const vrs = [
  28,
  '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a',
  '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff'
];
const vrsLess = [
  28,
  '0x1d97b6441922c69562ba0d7099a73ecab3a59f10776f9f2f6e06d8bd59361373',
  '0x681c986a0c96fb4aa644e8ed535e05427f5a9358783151b97ef43eda829a5468'
];
const vrs_dai = [
  27,
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556',
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff'
];
let P1;
let P2;
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
  newMember4
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
    tc = await TokenController.deployed();
    td = await TokenData.deployed();
    cr = await ClaimsReward.deployed();
    qd = await QuotationDataMock.deployed();
    P1 = await Pool1.deployed();
    P2 = await Pool2.deployed();
    qt = await Quotation.deployed();
    cad = await DAI.deployed();
    mcr = await MCR.deployed();
    mcrd = await MCRDataMock.deployed();
  });

  describe('Cover Purchase', function() {
    describe('Details', function() {
      it('should return correct AuthQuoteEngine address', async function() {
        const authQE = await qd.getAuthQuoteEngine();
        authQE.should.equal(QE);
      });

      it('should return correct product name', async function() {
        const pname = await qd.productName();
        pname.should.equal(PNAME);
      });
    });

    describe('If user is a member', function() {
      before(async function() {
        await tf.payJoiningFee(member1, { from: member1, value: fee });
        await tf.kycVerdict(member1, true);
        await tk.approve(tc.address, UNLIMITED_ALLOWANCE, { from: member1 });
      });

      describe('If user does not have sufficient funds', function() {
        it('reverts', async function() {
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
            P2.makeCoverUsingCA(
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
              await tf.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await tf.kycVerdict(coverHolder, true);
              await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
                from: coverHolder
              });
              await tk.transfer(coverHolder, tokens);
            });
            it('should not have locked Cover Note initially', async function() {
              const initialLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('total sum assured should be 0 ETH initially', async function() {
              const initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(0);
            });
            it('should be able to purchase cover', async function() {
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
            it('should return correct cover details', async function() {
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
              await tf.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await tf.kycVerdict(coverHolder, true);
              await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
                from: coverHolder
              });
              await tk.transfer(coverHolder, tokens);
            });
            it('should not have locked Cover Note initially', async function() {
              const initialLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('total sum assured should be 1 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(1);
            });
            it('should be able to purchase cover', async function() {
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
            it('should return correct cover details', async function() {
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
            let presentPoolBalanceOfCA;
            before(async function() {
              await tf.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await tf.kycVerdict(coverHolder, true);
              await P1.buyToken({
                from: coverHolder,
                value: tokenAmount
              });
              await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
                from: coverHolder
              });
              await cad.transfer(coverHolder, tokenDai);
            });
            it('should not have locked Cover Note initially', async function() {
              const initialLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('total sum assured should be 2 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(2);
            });
            it('should able to purchase cover using currency assest i.e. DAI ', async function() {
              const initialCAbalance = await cad.balanceOf(coverHolder);
              const initialPoolBalanceOfCA = await cad.balanceOf(P1.address);
              const initialTotalSupply = await tk.totalSupply();
              await cad.approve(P2.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P2.makeCoverUsingCA(
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
            it('currency assest balance should increase after cover purchase', async function() {
              const presentPoolBalanceOfCA = new BigNumber(
                coverDetailsDai[1].toString()
              );
              presentPoolBalanceOfCA.should.be.bignumber.equal(
                await cad.balanceOf(P1.address)
              );
            });
            it('should return correct cover details purchased with DAI', async function() {
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
            await tf.payJoiningFee(staker2, {
              from: staker2,
              value: fee
            });
            await tf.kycVerdict(staker2, true);
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
            const commission = coverDetails[2] * 0.2 - 1;
            it('should be able to purchase cover ', async function() {
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

            it('staker gets 20% commission', async function() {
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
            const commission = coverDetails[2] * 0.2 - 1;
            it('should be able to purchase cover', async function() {
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
            it('staker gets 20% commission', async function() {
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
            const commission = coverDetailsDai[2] * 0.2 - 1;
            it('should able to purchase cover using currency assest i.e. DAI ', async function() {
              initialStakeCommissionOfS1 = await td.getStakerTotalEarnedStakeCommission.call(
                staker1
              );
              initialStakeCommissionOfS2 = await td.getStakerTotalEarnedStakeCommission.call(
                staker2
              );
              await cad.approve(P2.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P2.makeCoverUsingCA(
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
            it('staker gets 20% commission', async function() {
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
        });
      });
    });

    describe('If user is not a member', function() {
      it('should revert if member', async function() {
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
        it('reverts', async function() {
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
            P2.makeCoverUsingCA(
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
          await qt.kycTrigger(false, notMember);
        });
      });
      describe('if want to join membership', function() {
        it('should be able to join membership and purchase cover with ETH', async function() {
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
          await qt.kycTrigger(true, newMember1);
        });
        it('should be able to join membership and purchase cover with DAI', async function() {
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
          await qt.kycTrigger(true, newMember2);
        });
        it('should refund full amount to new member', async function() {
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
          await assertRevert(qt.kycTrigger(true, newMember3));
        });
        it('should get membership but not cover if quote expires for ETH', async function() {
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
          await qt.kycTrigger(true, newMember4);
        });

        it('should revert if quote validity expires', async function() {
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

        it('should get membership but not cover if quote expires for DAI', async function() {
          //await cad.transfer(notMember, coverDetailsDai[1]);
          /*await cad.approve(qt.address, coverDetailsDai[1], {
            from: notMember
          });*/
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
          await qt.kycTrigger(true, notMember);
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
    it('cover should not expired before validity', async function() {
      (await qt.checkCoverExpired(1)).should.be.equal(false);
      await increaseTimeTo(validityofCover.plus(1));
    });

    it('cover should be expired after validity expires', async function() {
      initialSumAssured = await qd.getTotalSumAssured(CA_ETH);
      await qt.expireCover(1);
      (await qt.checkCoverExpired(1)).should.be.equal(true);
    });

    it('decrease sum assured', async function() {
      const newSumAssured = await qd.getTotalSumAssured(CA_ETH);
      newSumAssured.should.be.bignumber.equal(initialSumAssured.minus(1));
    });
    it('should change cover status', async function() {
      (await qd.getCoverStatusNo(1)).should.be.bignumber.equal(3);
    });
    it('should unlock locked cover note tokens', async function() {
      const unLockedCN = BN_10.times(coverDetails[2])
        .div(BN_100)
        .toFixed(0);
      (await tk.balanceOf(member3)).should.be.bignumber.equal(
        initialTokenBalance.plus(unLockedCN)
      );
    });
  });

  describe('Transfer Assest', function() {
    describe('if authorized', function() {
      it('should be able to transfer assest back', async function() {
        await qt.transferBackAssets({ from: owner });
        await cad.transfer(qt.address, tokenDai);
        await qt.transferBackAssets({ from: owner });
        await qt.sendTransaction({ from: owner, value: 1 });
        await qt.transferBackAssets({ from: owner });
      });
      it('should be able to transfer assest to new contract', async function() {
        const newqt = await Quotation.new();
        await qt.transferAssetsToNewContract(newqt.address, { from: owner });
        await qt.sendTransaction({ from: owner, value: 1 });
        await cad.transfer(qt.address, tokenDai);
        await qt.transferAssetsToNewContract(newqt.address, { from: owner });
      });
    });
    describe('if not authorized', function() {
      it('reverts', async function() {
        await assertRevert(qt.transferBackAssets({ from: notMember }));
        const newqt = await Quotation.new();
        await assertRevert(
          qt.transferAssetsToNewContract(newqt.address, { from: notMember })
        );
      });
    });
  });

  describe('Misc', function() {
    describe('Change product params if owner', function() {
      it('should be able to change Product Hash', async function() {
        await qd.changeProductHash('New Test Cover');
        (await qd.productHash()).should.equal('New Test Cover');
      });
      it('should be able to change Profit Margin', async function() {
        await qd.changePM(4);
      });
      it('should be able to change STLP', async function() {
        await qd.changeSTLP(5);
      });
      it('should be able to change STL', async function() {
        await qd.changeSTL(1);
      });
      it('should be able to change minimum cover period', async function() {
        await qd.changeMinDays(31);
      });
    });
    describe('if not internal contract address', function() {
      it('should not be able to change master address', async function() {
        await assertRevert(
          qd.changeMasterAddress(qd.address, { from: notMember })
        );
        await assertRevert(
          qt.changeMasterAddress(qd.address, { from: notMember })
        );
      });
      it('should not be able to change cover status number', async function() {
        const CID = await qd.getAllCoversOfUser(member3);
        await assertRevert(
          qd.changeCoverStatusNo(CID[0], 1, { from: notMember })
        );
      });
    });
  });
});
