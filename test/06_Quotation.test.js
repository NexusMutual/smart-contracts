const Pool1 = artifacts.require('Pool1');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationDataMock = artifacts.require('QuotationDataMock');
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
const NPNAME = '0x5443000000000000';
const NPHASH = 'Test Cover';
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
  newMember1,
  newMember2,
  newMember3,
  newMember4,
  newMember5
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
    qd = await QuotationDataMock.deployed();
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
              await td.getBalanceCN(coverHolder);
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
              await td.getBalanceLockedTokens(CID[0], coverHolder);
              await qd.getCoverPeriod(CID[0]);
              await qd.getCoverPremium(CID[0]);
              await qd.getTotalSumAssuredSC(smartConAdd, CA_ETH);
              await qd.getCoverStatusLen();
              await qd.getAllCoverStatus();
              await qd.getCoverStatus(CID[0]);
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
          const stca = new BigNumber(500000000000);
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
            await nxmtk2.addStake(smartConAdd, ether(0.000001), {
              from: staker1
            });
            await nxmtk2.addStake(smartConAdd, stakeTokens, {
              from: staker2
            });
          });

          describe('Purchase Cover With Ether', function() {
            const coverHolder = member3;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('should be able to purchase cover ', async function() {
              initialStakeCommissionOfS1 = await cr.getTotalStakeCommission(
                staker1
              );
              initialStakeCommissionOfS2 = await cr.getTotalStakeCommission(
                staker2
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
              (await cr.getTotalStakeCommission(
                staker1
              )).should.be.bignumber.equal(
                initialStakeCommissionOfS1.plus(stca)
              );
              const newStakeCommissionOfS2 = initialStakeCommissionOfS2
                .plus(
                  BN_20.times(
                    new BigNumber(coverDetails[2].toString()).div(BN_100)
                  )
                )
                .minus(stca)
                .toFixed(0);
              (await cr.getTotalStakeCommission(
                staker2
              )).should.be.bignumber.equal(newStakeCommissionOfS2);
            });
          });

          describe('Purchase Cover With NXM', function() {
            const coverHolder = member4;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('should be able to purchase cover', async function() {
              initialStakeCommissionOfS1 = await cr.getTotalStakeCommission(
                staker1
              );
              initialStakeCommissionOfS2 = await cr.getTotalStakeCommission(
                staker2
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
              (await cr.getTotalStakeCommission(
                staker1
              )).should.be.bignumber.equal(initialStakeCommissionOfS1);
              const newStakeCommissionOfS2 = initialStakeCommissionOfS2
                .plus(
                  BN_20.times(
                    new BigNumber(coverDetails[2].toString()).div(BN_100)
                  )
                )
                .toFixed(0);
              (await cr.getTotalStakeCommission(
                staker2
              )).should.be.bignumber.equal(newStakeCommissionOfS2);
            });
          });

          describe('Purchase Cover With DAI', function() {
            const coverHolder = member5;
            let initialPoolBalanceOfCA;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('should able to purchase cover using currency assest i.e. DAI ', async function() {
              initialStakeCommissionOfS1 = await cr.getTotalStakeCommission(
                staker1
              );
              initialStakeCommissionOfS2 = await cr.getTotalStakeCommission(
                staker2
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
              (await cr.getTotalStakeCommission(
                staker1
              )).should.be.bignumber.equal(initialStakeCommissionOfS1);
              const newStakeCommissionOfS2 = initialStakeCommissionOfS2
                .plus(
                  BN_20.times(
                    new BigNumber(coverDetailsDai[2].toString()).div(BN_100)
                  )
                )
                .toFixed(0);
              (await cr.getTotalStakeCommission(
                staker2
              )).should.be.bignumber.equal(newStakeCommissionOfS2);
            });
          });
        });
      });
    });

    describe('If user is not a member', function() {
      it('should revert if member', async function() {
        const totalFee = fee.plus(coverDetails[1].toString());
        await assertRevert(
          qt.verifyQuote(
            PID,
            smartConAdd,
            'ETH',
            coverDetails,
            coverPeriod,
            v,
            r,
            s,
            { from: member1, value: totalFee }
          )
        );
      });
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
        it('should be able to join membership and purchase cover with ETH', async function() {
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
            { from: newMember1, value: totalFee }
          );

          await qt.kycTrigger(true, 2);
        });
        it('should be able to join membership and purchase cover with DAI', async function() {
          await cad.transfer(newMember2, tokenDai);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: newMember2
          });
          //const totalFee = fee.plus(coverDetailsDai[1].toString());
          await qt.verifyQuote(
            PID,
            smartConAdd,
            'DAI',
            coverDetailsDai,
            coverPeriod,
            v_dai,
            r_dai,
            s_dai,
            { from: newMember2, value: fee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember2, 0);
          await qt.kycTrigger(true, hcid);
        });
        it('should refund full amount to new member', async function() {
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
            { from: newMember3, value: totalFee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember3, 0);
          await assertRevert(qt.fullRefund(hcid, { from: owner }));
          await qt.fullRefund(hcid, { from: newMember3 });
        });
        it('should get membership but not cover if quote expires for ETH', async function() {
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
            { from: newMember4, value: totalFee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember4, 0);
          const newCoverDetails = coverDetails;
          newCoverDetails[3] = (await latestTime()) - 3;
          await qd.changeHoldedCoverDetails(hcid, newCoverDetails);
          await qt.kycTrigger(true, hcid);
        });

        it('should revert if quote validity expires', async function() {
          let newCoverDetails = coverDetails;
          const validity = await latestTime();
          newCoverDetails[3] = validity - 2;
          const totalFee = fee.plus(newCoverDetails[1].toString());
          await assertRevert(
            qt.verifyQuote(
              PID,
              smartConAdd,
              'ETH',
              newCoverDetails,
              coverPeriod,
              v,
              r,
              s,
              { from: notMember, value: totalFee }
            )
          );
        });

        it('should get membership but not cover if quote expires for DAI', async function() {
          await cad.transfer(notMember, tokenDai);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: notMember
          });
          await qt.verifyQuote(
            PID,
            smartConAdd,
            'DAI',
            coverDetailsDai,
            coverPeriod,
            v_dai,
            r_dai,
            s_dai,
            { from: notMember, value: fee }
          );
          const hcid = await qd.getUserHoldedCoverByIndex(notMember, 1);
          const newCoverDetails = coverDetailsDai;
          newCoverDetails[3] = (await latestTime()) - 3;
          await qd.changeHoldedCoverDetails(hcid, newCoverDetails);
          await qt.kycTrigger(true, hcid);
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
    });
    it('cover should not expired before validity', async function() {
      (await qt.checkCoverExpired(1)).should.be.bignumber.equal(0);
      await increaseTimeTo(validity.plus(1));
    });
    it('cover should be expired after validity expires', async function() {
      await qt.expireCover(1);
      (await qt.checkCoverExpired(1)).should.be.bignumber.equal(1);
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
      await td.getBalanceCN(member3);
      await td.getBalanceLockedTokens(1, member3);
      (await nxmtk1.balanceOf(member3)).should.be.bignumber.equal(
        initialTokenBalance.plus(unLockedCN)
      );
    });
  });

  describe('Transfer Assest', function() {
    describe('if authorized', function() {
      it('should be able to transfer assest back', async function() {
        await qt.transferBackAssets({ from: owner });
        await qt.sendTransaction({ from: owner, value: 1 });
        await qt.transferBackAssets({ from: owner });
      });
      it('should be able to transfer assest to new contract', async function() {
        const newqt = await Quotation.new();
        await qt.transferAssetsToNewContract(newqt.address, { from: owner });
        await qt.sendTransaction({ from: owner, value: 1 });
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
    let productCount;
    describe('Add new insured product details', function() {
      it('should not be able to add if not owner', async function() {
        await assertRevert(
          qd.addProductDetails(NPNAME, NPHASH, 90, 1000, 12, 0, {
            from: notMember
          })
        );
      });
      it('should be able to add if owner', async function() {
        productCount = await qd.getAllProductCount();
        await qd.addProductDetails(NPNAME, NPHASH, 90, 1000, 12, 0, {
          from: owner
        });
        const productDetails = await qd.getProductDetails(productCount);
        await qd.getProductHash(productCount);
        productDetails[1].should.equal(NPNAME);
        productDetails[2].should.equal(NPHASH);
      });
      it('should increase product count', async function() {
        (await qd.getAllProductCount()).should.be.bignumber.equal(
          productCount.plus(1)
        );
      });
    });

    describe('Change product params if owner', function() {
      const productID = productCount - 1;
      it('should be able to change Product Hash', async function() {
        await qd.changeProductHash(productID, 'New Test Cover');
        (await qd.getProductHash(productID)).should.equal('New Test Cover');
      });
      it('should be able to change Profit Margin', async function() {
        await qd.changePM(productID, 4);
      });
      it('should be able to change STLP', async function() {
        await qd.changeSTLP(productID, 5);
      });
      it('should be able to change STL', async function() {
        await qd.changeSTL(productID, 1);
      });
      it('should be able to change minimum cover period', async function() {
        await qd.changeMinDays(productID, 31);
      });
    });
    describe('if not internal contract address', function() {
      it('should not be able to change master address', async function() {
        await assertRevert(
          qd.changeMasterAddress(qd.address, { from: notMember })
        );
      });
      it('should not be able to change cover status number', async function() {
        const CID = await qd.getAllCoversOfUser(member3);
        await assertRevert(
          qd.changeCoverStatusNo(CID[1], 1, { from: notMember })
        );
      });
    });
  });
});
