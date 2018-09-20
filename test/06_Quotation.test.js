const Pool1 = artifacts.require('Pool1');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationData = artifacts.require('QuotationData');
const Quotation = artifacts.require('Quotation');
const DAI = artifacts.require('DAI');
const NXMTokenData = artifacts.require('NXMTokenData');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const expectEvent = require('./utils/expectEvent');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const coverDetailsDai = [5, 16812229066849188, 5694231991898, 7972408607];
const v = 28;
const v_dai = 27;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';
const r_dai =
  '0xdcaa177410672d90890f1c0a42a965b3af9026c04caedbce9731cb43827e8556';
const s_dai =
  '0x2b9f34e81cbb79f9af4b8908a7ef8fdb5875dedf5a69f84cd6a80d2a4cc8efff';

let P1;
let nxmtk1;
let nxmtk2;
let cr;
let qd;
let qt;
let cad;
let td;

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
  newMember
]) {
  const BN_100 = new BigNumber(100);
  const BN_5 = new BigNumber(5);
  const BN_20 = new BigNumber(20);
  const BN_95 = new BigNumber(95);
  const P_18 = new BigNumber(1e18);
  const tokenAmount = ether(1);
  const tokenDai = ether(4);
  const stakeTokens = ether(3);

  before(async function() {
    await advanceBlock();
    nxmtk1 = await NXMToken1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    cr = await ClaimsReward.deployed();
    qd = await QuotationData.deployed();
    P1 = await Pool1.deployed();
    qt = await Quotation.deployed();
    cad = await DAI.deployed();
    td = await NXMTokenData.deployed();
  });

  describe('Cover Purchase', function() {
    describe('Details', function() {
      it('should return correct AuthQuoteEngine address', async function() {
        const authQE = await qd.getAuthQuoteEngine();
        authQE.should.equal(QE);
      });

      it('should return correct product name', async function() {
        const pname = await qd.getProductName(PID);
        pname.should.equal(PNAME);
      });
    });

    describe('If user is a member', function() {
      before(async function() {
        await nxmtk2.payJoiningFee(member1, { from: member1, value: fee });
      });

      describe('If user does not have sufficient funds', function() {
        it('reverts', async function() {
          await assertRevert(
            P1.makeCoverBegin(
              PID,
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              v,
              r,
              s,
              { from: member1, value: coverDetails[1] - 1 }
            )
          );
          await assertRevert(
            qt.makeCoverUsingNXMTokens(
              PID,
              coverDetails,
              coverPeriod,
              'ETH',
              smartConAdd,
              v,
              r,
              s,
              { from: member1 }
            )
          );
          await assertRevert(
            P1.makeCoverUsingCA(
              PID,
              smartConAdd,
              'DAI',
              coverDetailsDai,
              coverPeriod,
              v_dai,
              r_dai,
              s_dai,
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
              await nxmtk2.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await P1.buyTokenBegin({
                from: coverHolder,
                value: tokenAmount
              });
            });
            it('should not have locked Cover Note initially', async function() {
              const initialLockedCN = await nxmtk2.totalBalanceCNOfUser(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('total sum assured should be 0 ETH initially', async function() {
              const initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(0);
            });
            it('should be able to purchase cover ', async function() {
              const initialPoolBalance = await P1.getEtherPoolBalance();
              const initialTokensOfCoverHolder = await td.getBalanceOf(
                coverHolder
              );
              initialTotalSupply = (await td.totalSupply()).div(P_18);
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
              const newLockedCN = BN_5.times(coverDetails[2]).div(BN_100);
              const newPoolBalance = initialPoolBalance.plus(
                new BigNumber(coverDetails[1].toString())
              );
              const newTotalSA = new BigNumber(coverDetails[0]);
              const newTokensOfCoverHolder = initialTokensOfCoverHolder.plus(
                newLockedCN
              );
              const newTotalSupply = initialTotalSupply
                .plus(newLockedCN.div(P_18))
                .toFixed(0);
              newLockedCN
                .toFixed(0)
                .should.be.bignumber.equal(
                  await nxmtk2.totalBalanceCNOfUser(coverHolder)
                );

              newPoolBalance.should.be.bignumber.equal(
                await P1.getEtherPoolBalance()
              );
              newTotalSA.should.be.bignumber.equal(
                await qd.getTotalSumAssured(CA_ETH)
              );
              newTokensOfCoverHolder
                .toFixed(0)
                .should.be.bignumber.equal(await td.getBalanceOf(coverHolder));
              newTotalSupply.should.be.bignumber.equal(
                (await td.totalSupply()).div(P_18).toFixed(0)
              );
            });
            it('should return correct cover details', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              if (
                cdetails2[1] == CA_ETH &&
                cdetails1[1] == PNAME &&
                cdetails1[2] == coverHolder &&
                cdetails1[3] == smartConAdd
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
              await nxmtk2.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await P1.buyTokenBegin({
                from: coverHolder,
                value: tokenAmount
              });
            });
            it('should not have locked Cover Note initially', async function() {
              const initialLockedCN = await nxmtk2.totalBalanceCNOfUser(
                coverHolder
              );
              initialLockedCN.should.be.bignumber.equal(0);
            });
            it('total sum assured should be 1 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.should.be.bignumber.equal(1);
            });
            it('should be able to purchase cover', async function() {
              const initialTokensOfCoverHolder = await td.getBalanceOf(
                coverHolder
              );
              initialTotalSupply = (await td.totalSupply()).div(P_18);
              await qt.makeCoverUsingNXMTokens(
                PID,
                coverDetails,
                coverPeriod,
                'ETH',
                smartConAdd,
                v,
                r,
                s,
                { from: coverHolder }
              );
              const newLockedCN = BN_5.times(coverDetails[2]).div(BN_100);
              const newTotalSA = initialTotalSA.plus(
                new BigNumber(coverDetails[0])
              );
              const newTokensOfCoverHolder = initialTokensOfCoverHolder
                .plus(newLockedCN)
                .minus(coverDetails[2]);
              const newTotalSupply = initialTotalSupply
                .plus(newLockedCN.div(P_18))
                .toFixed(0);
              newLockedCN
                .toFixed(0)
                .should.be.bignumber.equal(
                  await nxmtk2.totalBalanceCNOfUser(coverHolder)
                );
              newTotalSA.should.be.bignumber.equal(
                await qd.getTotalSumAssured(CA_ETH)
              );
              newTokensOfCoverHolder
                .toFixed(0)
                .should.be.bignumber.equal(await td.getBalanceOf(coverHolder));
              newTotalSupply.should.be.bignumber.equal(
                (await td.totalSupply()).div(P_18).toFixed(0)
              );
            });
            it('should return correct cover details', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              if (
                cdetails2[1] == CA_ETH &&
                cdetails1[1] == PNAME &&
                cdetails1[2] == coverHolder &&
                cdetails1[3] == smartConAdd
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
              await nxmtk2.payJoiningFee(coverHolder, {
                from: coverHolder,
                value: fee
              });
              await P1.buyTokenBegin({
                from: coverHolder,
                value: tokenAmount
              });
              await cad.transfer(coverHolder, tokenDai);
            });
            it('should not have locked Cover Note initially', async function() {
              const initialLockedCN = await nxmtk2.totalBalanceCNOfUser(
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
              const initialTotalSupply = await td.totalSupply();
              await cad.approve(P1.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                PID,
                smartConAdd,
                'DAI',
                coverDetailsDai,
                coverPeriod,
                v_dai,
                r_dai,
                s_dai,
                { from: coverHolder }
              );
              const presentLockedCN = await nxmtk2.totalBalanceCNOfUser(
                coverHolder
              );
              const presentCAbalance = await cad.balanceOf(coverHolder);
              const presentTotalSupply = await td.totalSupply();
              const newLockedCN = BN_5.times(
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
                cdetails2[1] == CA_DAI &&
                cdetails1[1] == PNAME &&
                cdetails1[2] == coverHolder &&
                cdetails1[3] == smartConAdd
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
          before(async function() {
            await nxmtk2.payJoiningFee(staker1, {
              from: staker1,
              value: fee
            });
            await P1.buyTokenBegin({ from: staker1, value: tokenAmount });
            await nxmtk2.payJoiningFee(staker2, {
              from: staker2,
              value: fee
            });
            await P1.buyTokenBegin({ from: staker2, value: tokenAmount });
            await nxmtk2.addStake(smartConAdd, stakeTokens, {
              from: staker1
            });
            await nxmtk2.addStake(smartConAdd, stakeTokens, {
              from: staker2
            });
          });

          describe('Purchase Cover With Ether', function() {
            const coverHolder = member3;
            let initialStakeCommission;
            it('should be able to purchase cover ', async function() {
              initialStakeCommission = await cr.getTotalStakeCommission(
                staker1
              );
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
            });
            it('staker gets 20% commission', async function() {
              const newStakeCommission = initialStakeCommission
                .plus(
                  BN_20.times(
                    new BigNumber(coverDetails[2].toString()).div(BN_100)
                  )
                )
                .toFixed(0);
              newStakeCommission.should.be.bignumber.equal(
                await cr.getTotalStakeCommission(staker1)
              );
            });
          });

          describe('Purchase Cover With NXM', function() {
            const coverHolder = member4;
            let initialStakeCommission;
            it('should be able to purchase cover', async function() {
              initialStakeCommission = await cr.getTotalStakeCommission(
                staker1
              );
              await qt.makeCoverUsingNXMTokens(
                PID,
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
            it('staker gets 20% commission', async function() {
              const newStakeCommission = initialStakeCommission
                .plus(
                  BN_20.times(
                    new BigNumber(coverDetails[2].toString()).div(BN_100)
                  )
                )
                .toFixed(0);
              newStakeCommission.should.be.bignumber.equal(
                await cr.getTotalStakeCommission(staker1)
              );
            });
          });

          describe('Purchase Cover With DAI', function() {
            const coverHolder = member5;
            let initialPoolBalanceOfCA;
            let initialStakeCommission;
            it('should able to purchase cover using currency assest i.e. DAI ', async function() {
              initialStakeCommission = await cr.getTotalStakeCommission(
                staker1
              );
              await cad.approve(P1.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                PID,
                smartConAdd,
                'DAI',
                coverDetailsDai,
                coverPeriod,
                v_dai,
                r_dai,
                s_dai,
                { from: coverHolder }
              );
            });
            it('staker gets 20% commission', async function() {
              const newStakeCommission = initialStakeCommission
                .plus(
                  BN_20.times(
                    new BigNumber(coverDetailsDai[2].toString()).div(BN_100)
                  )
                )
                .toFixed(0);
              newStakeCommission.should.be.bignumber.equal(
                await cr.getTotalStakeCommission(staker1)
              );
            });
          });
        });
      });
    });

    describe('If user is not a member', function() {
      describe('if do not want to join membership', function() {
        it('reverts', async function() {
          await assertRevert(
            P1.makeCoverBegin(
              PID,
              smartConAdd,
              'ETH',
              coverDetails,
              coverPeriod,
              v,
              r,
              s,
              { from: notMember, value: coverDetails[1] }
            )
          );

          await assertRevert(
            qt.makeCoverUsingNXMTokens(
              PID,
              coverDetails,
              coverPeriod,
              'ETH',
              smartConAdd,
              v,
              r,
              s,
              { from: notMember }
            )
          );
          await assertRevert(
            P1.makeCoverUsingCA(
              PID,
              smartConAdd,
              'DAI',
              coverDetailsDai,
              coverPeriod,
              v_dai,
              r_dai,
              s_dai,
              { from: notMember }
            )
          );
          const totalFee = fee.plus(coverDetails[1].toString());
          await qt.verifyQuote(
            PID,
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            v,
            r,
            s,
            { from: notMember, value: totalFee }
          );
          let hcl = await qd.getUserHoldedCoverLength(notMember);
          await qt.kycTrigger(false, hcl);
        });
      });
      describe('if want to join membership', function() {
        it('should be able to join membership and purchase cover', async function() {
          const totalFee = fee.plus(coverDetails[1].toString());
          await qt.verifyQuote(
            PID,
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            v,
            r,
            s,
            { from: newMember, value: totalFee }
          );
          await qt.kycTrigger(true, 2);
        });
      });
    });
  });

  describe('Cover Expire', function() {
    let initialSumAssured;
    let initialTokenBalance;
    before(async function() {
      initialTokenBalance = await nxmtk1.balanceOf(member3);
      initialSumAssured = await qd.getTotalSumAssured(CA_ETH);
      validity = await qd.getValidityOfCover(1);
      await increaseTimeTo(validity.plus(1));
    });
    it('cover should be expired after validity expires', async function() {
      qt.expireCover(1);
    });

    it('decrease sum assured', async function() {
      const newSumAssured = await qd.getTotalSumAssured(CA_ETH);
      newSumAssured.should.be.bignumber.equal(initialSumAssured.minus(1));
    });
    it('should change cover status', async function() {
      (await qd.getCoverStatusNo(1)).should.be.bignumber.equal(3);
    });
    it('should unlock locked cover note tokens', async function() {
      const unLockedCN = BN_5.times(coverDetails[2])
        .div(BN_100)
        .toFixed(0);
      (await nxmtk1.balanceOf(member3)).should.be.bignumber.equal(
        initialTokenBalance.plus(unLockedCN)
      );
    });
  });
});
