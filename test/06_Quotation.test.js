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
const Governance = artifacts.require('Governance');
const NXMaster = artifacts.require('NXMasterMock');
const PoolData = artifacts.require('PoolDataMock');

const PooledStaking = artifacts.require('PooledStakingMock');

const {assertRevert} = require('./utils/assertRevert');
const {advanceBlock} = require('./utils/advanceToBlock');
const {ether, toHex, toWei} = require('./utils/ethTools');
const {increaseTimeTo} = require('./utils/increaseTime');
const {latestTime} = require('./utils/latestTime');
const expectEvent = require('./utils/expectEvent');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const encode1 = require('./utils/encoder.js').encode1;
const getQuoteValues = require('./utils/getQuote.js').getQuoteValues;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';
const fee = toWei(0.002);
const QE = '0x51042c4d8936a7764d18370a6a0762b860bb8e07';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const NPNAME = '0x5443000000000000';
const NPHASH = 'Test Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const nullAddress = '0x0000000000000000000000000000000000000000';
const coverPeriod = 61;
const coverPeriodLess = 50;
const coverDetails = [
  1,
  '3362445813369838',
  '744892736679184',
  '7972408607',
  '7972408607000'
];
const coverDetailsLess = [
  5,
  '19671964915000000',
  '20000000000000000000',
  '3549627424'
];
const coverDetailsDai = [5, '16812229066849188', '5694231991898', '7972408607'];
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
let ps;
const BN = web3.utils.BN;

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
  const BN_100 = new BN((100).toString());
  const BN_10 = new BN((10).toString());
  const P_18 = new BN((1e18).toString());
  const tokens = ether(200);
  const tokenAmount = ether(1);
  const tokenDai = ether(4);
  const stakeTokens = ether(20);
  const UNLIMITED_ALLOWANCE = new BN((2).toString())
    .pow(new BN((256).toString()))
    .sub(new BN((1).toString()));

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
    nxms = await NXMaster.at(await td.ms());
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    ps = await PooledStaking.at(await nxms.getLatestAddress(toHex('PS')));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    // await mr.payJoiningFee(owner, {
    //   from: owner,
    //   value: fee
    // });
    // await mr.kycVerdict(owner, true);
    let oldMR = await MemberRoles.at(await nxms.getLatestAddress(toHex('MR')));
    let oldGv = await Governance.at(await nxms.getLatestAddress(toHex('GV')));
    async function updateCategory(nxmAdd, functionName, updateCat) {
      let actionHash = encode1(
        [
          'uint256',
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string'
        ],
        [
          updateCat,
          'Edit Category',
          2,
          50,
          15,
          [2],
          604800,
          '',
          nxmAdd,
          toHex('MS'),
          [0, 0, 80, 0],
          functionName
        ]
      );
      await gvProp(4, actionHash, oldMR, oldGv, 1);
    }
    await updateCategory(
      nxms.address,
      'upgradeMultipleContracts(bytes2[],address[])',
      29
    );
    let sevenDays = (await latestTime()) / 1 + 3600 * 24 * 7;
    await increaseTimeTo(
      new BN(sevenDays.toString()).add(new BN((1).toString()))
    );
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
          toHex('ETH'),
          coverDetails,
          coverPeriod,
          vrs[0],
          vrs[1],
          vrs[2],
          {from: newMember6, value: coverDetails[1]}
        )
      );
    });

    it('6.2 should return 1 if 100% mcr reached within 30 days of launch', async function() {
      await mcr.addMCRData(
        await getValue(toWei(2), pd, mcr),
        toWei(100),
        toWei(2),
        ['0x455448', '0x444149'],
        [100, 65407],
        20181011
      );
      (await pd.capReached()).toString().should.be.equal((1).toString());
    });
  });
  describe('Cover Purchase', function() {
    describe('Details', function() {
      it('6.3 should return correct AuthQuoteEngine address', async function() {
        const authQE = await qd.getAuthQuoteEngine();
        authQE
          .toString()
          .should.equal(web3.utils.toChecksumAddress(QE).toString());
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
        await mr.payJoiningFee(member1, {from: member1, value: fee});
        await mr.kycVerdict(member1, true);
        await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {from: member1});
      });

      describe('If user does not have sufficient funds', function() {
        it('6.5 reverts', async function() {
          await assertRevert(
            P1.makeCoverBegin(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              {from: member1, value: coverDetails[1] - 1}
            )
          );
          await assertRevert(
            qt.makeCoverUsingNXMTokens(
              coverDetails,
              coverPeriod,
              toHex('ETH'),
              smartConAdd,
              vrs[0],
              vrs[1],
              vrs[2],
              {from: member1}
            )
          );
          await assertRevert(
            P1.makeCoverUsingCA(
              smartConAdd,
              toHex('DAI'),
              coverDetailsDai,
              coverPeriod,
              vrs_dai[0],
              vrs_dai[1],
              vrs_dai[2],
              {from: member1}
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
              initialLockedCN.toString().should.be.equal((0).toString());
            });
            it('6.7 total sum assured should be 0 ETH initially', async function() {
              const initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.toString().should.be.equal((0).toString());
            });
            it('6.8 should not be able to purchase cover if premiumNXM is 0', async function() {
              initialTotalSupply = (await tk.totalSupply()).div(P_18);
              let premiumNXM = coverDetails[2];

              // coverDetails[2](premiumNXM) is 0 (refer TokenFunctions.sol)
              coverDetails[2] = 0;
              await assertRevert(
                P1.makeCoverBegin(
                  smartConAdd,
                  toHex('ETH'),
                  coverDetails,
                  coverPeriod,
                  vrs[0],
                  vrs[1],
                  vrs[2],
                  {from: coverHolder, value: coverDetails[1]}
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
              var vrsdata = await getQuoteValues(
                coverDetails,
                toHex('ETH'),
                coverPeriod,
                smartConAdd,
                qt.address
              );
              await P1.makeCoverBegin(
                smartConAdd,
                toHex('ETH'),
                coverDetails,
                coverPeriod,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder, value: coverDetails[1]}
              );

              const newLockedCN = BN_10.mul(
                new BN(coverDetails[2].toString())
              ).div(BN_100);
              const newPoolBalance = new BN(initialPoolBalance.toString()).add(
                new BN(coverDetails[1].toString())
              );
              const newTotalSA = new BN(coverDetails[0].toString());
              const newTotalSupply = new BN(initialTotalSupply.toString()).add(
                new BN(newLockedCN.toString()).div(new BN(P_18.toString()))
              );

              newLockedCN
                .toString()
                .should.be.equal(
                  (
                    await tf.getUserLockedCNTokens.call(coverHolder, 1)
                  ).toString()
                );
              newPoolBalance
                .toString()
                .should.be.equal(
                  (await web3.eth.getBalance(P1.address)).toString()
                );
              newTotalSA
                .toString()
                .should.be.equal(
                  (await qd.getTotalSumAssured(CA_ETH)).toString()
                );
              (await tk.balanceOf(coverHolder))
                .toString()
                .should.be.equal(initialTokensOfCoverHolder.toString());
              newTotalSupply
                .toString()
                .should.be.equal(
                  new BN((await tk.totalSupply()).toString())
                    .div(new BN(P_18.toString()))
                    .toString()
                );
            });
            it('6.10 should be revert if smart contract address is null', async function() {
              coverDetails[4] = 7972408607114;
              var vrsdata = await getQuoteValues(
                coverDetails,
                toHex('ETH'),
                coverPeriod,
                smartConAdd,
                qt.address
              );
              await assertRevert(
                P1.makeCoverBegin(
                  nullAddress,
                  toHex('ETH'),
                  coverDetails,
                  coverPeriod,
                  vrsdata[0],
                  vrsdata[1],
                  vrsdata[2],
                  {from: coverHolder, value: coverDetails[1]}
                )
              );
            });
            it('6.11 should return correct cover details', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              let smartCACompare =
                web3.utils.toChecksumAddress(cdetails1[2]) ==
                web3.utils.toChecksumAddress(smartConAdd);
              if (
                cdetails1[3] == CA_ETH &&
                cdetails1[1] == coverHolder &&
                smartCACompare
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
              initialLockedCN.toString().should.be.equal((0).toString());
            });
            it('6.13 total sum assured should be 1 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.toString().should.be.equal((1).toString());
            });
            it('6.14 should be able to purchase cover', async function() {
              const initialTokensOfCoverHolder = await tk.balanceOf(
                coverHolder
              );
              initialTotalSupply = (await tk.totalSupply()).div(P_18);
              coverDetails[4] = 7972408607001;
              var vrsdata = await getQuoteValues(
                coverDetails,
                toHex('ETH'),
                coverPeriod,
                smartConAdd,
                qt.address
              );
              await qt.makeCoverUsingNXMTokens(
                coverDetails,
                coverPeriod,
                toHex('ETH'),
                smartConAdd,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder}
              );
              const newLockedCN = new BN(BN_10.toString())
                .mul(new BN(coverDetails[2].toString()))
                .div(new BN(BN_100.toString()));
              const newTotalSA = new BN(initialTotalSA.toString()).add(
                new BN(coverDetails[0].toString())
              );
              const newTokensOfCoverHolder = new BN(
                initialTokensOfCoverHolder.toString()
              ).sub(new BN(coverDetails[2].toString()));
              const newTotalSupply = new BN(initialTotalSupply.toString()).add(
                new BN(newLockedCN.toString()).div(new BN(P_18.toString()))
              );
              newLockedCN
                .toString()
                .should.be.equal(
                  (
                    await tf.getUserAllLockedCNTokens.call(coverHolder)
                  ).toString()
                );
              newTotalSA
                .toString()
                .should.be.equal(
                  (await qd.getTotalSumAssured(CA_ETH)).toString()
                );
              newTokensOfCoverHolder
                .toString()
                .should.be.equal((await tk.balanceOf(coverHolder)).toString());
              newTotalSupply.toString().should.be.equal(
                new BN((await tk.totalSupply()).toString())
                  .div(new BN(P_18.toString()))
                  .add(new BN((1).toString()))
                  .toString()
              );
            });
            it('6.15 should return correct cover details', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              let smartCACompare =
                web3.utils.toChecksumAddress(cdetails1[2]) ==
                web3.utils.toChecksumAddress(smartConAdd);
              if (
                cdetails1[3] == CA_ETH &&
                cdetails1[1] == coverHolder &&
                smartCACompare
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
              initialLockedCN.toString().should.be.equal((0).toString());
            });
            it('6.17 total sum assured should be 2 ETH initially', async function() {
              initialTotalSA = await qd.getTotalSumAssured(CA_ETH);
              initialTotalSA.toString().should.be.equal((2).toString());
            });
            it('6.18 should able to purchase cover using currency assest i.e. DAI ', async function() {
              const initialCAbalance = await cad.balanceOf(coverHolder);
              initialPoolBalanceOfCA = await cad.balanceOf(P1.address);
              const initialTotalSupply = await tk.totalSupply();
              coverDetailsDai[4] = 7972408607002;
              var vrsdata = await getQuoteValues(
                coverDetailsDai,
                toHex('DAI'),
                coverPeriod,
                smartConAdd,
                qt.address
              );

              await cad.approve(P1.address, coverDetailsDai[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                smartConAdd,
                toHex('DAI'),
                coverDetailsDai,
                coverPeriod,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder}
              );

              await ps.processPendingActions('100');

              const presentLockedCN = await tf.getUserAllLockedCNTokens.call(
                coverHolder
              );
              const presentCAbalance = await cad.balanceOf(coverHolder);
              const presentTotalSupply = await tk.totalSupply();
              const newLockedCN = BN_10.mul(
                new BN(coverDetailsDai[2].toString()).div(BN_100)
              );
              const newTotalSupply = new BN(initialTotalSupply.toString()).add(
                new BN(newLockedCN.toString())
              );
              presentCAbalance
                .toString()
                .should.be.equal(
                  new BN(initialCAbalance.toString())
                    .sub(new BN(coverDetailsDai[1].toString()))
                    .toString()
                );
              var newLockedCNVal = newLockedCN.toString();
              newLockedCNVal = newLockedCNVal.substring(
                0,
                newLockedCNVal.length - 1
              );
              var presentLockedCNVal = presentLockedCN.toString();
              presentLockedCNVal = presentLockedCNVal.substring(
                0,
                presentLockedCNVal.length - 1
              );
              newLockedCNVal.should.be.equal(presentLockedCNVal.toString());
              var newTotalSupplyVal = newTotalSupply.toString();
              newTotalSupplyVal = newTotalSupplyVal.substring(
                0,
                newTotalSupplyVal.length - 2
              );
              var presentTotalSupplyVal = presentTotalSupply.toString();
              var presentTotalSupplyVal = presentTotalSupplyVal.substring(
                0,
                presentTotalSupplyVal.length - 2
              );
              newTotalSupplyVal
                .toString()
                .should.be.equal(presentTotalSupplyVal.toString());
            });
            it('6.19 currency assest balance should increase after cover purchase', async function() {
              const presentPoolBalanceOfCA = new BN(
                coverDetailsDai[1].toString()
              );
              (await cad.balanceOf(P1.address))
                .toString()
                .should.be.equal(
                  new BN(initialPoolBalanceOfCA.toString())
                    .add(new BN(presentPoolBalanceOfCA.toString()))
                    .toString()
                );
            });
            it('6.20 should return correct cover details purchased with DAI', async function() {
              const CID = await qd.getAllCoversOfUser(coverHolder);
              let checkd = false;
              const cdetails1 = await qd.getCoverDetailsByCoverID1(CID[0]);
              const cdetails2 = await qd.getCoverDetailsByCoverID2(CID[0]);
              let smartCACompare =
                web3.utils.toChecksumAddress(cdetails1[2]) ==
                web3.utils.toChecksumAddress(smartConAdd);
              if (
                cdetails1[3] == CA_DAI &&
                cdetails1[1] == coverHolder &&
                smartCACompare
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
          const stakers = [staker1, staker2];
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

            await tk.approve(ps.address, stakeTokens, {
              from: staker1
            });
            await ps.depositAndStake(
              stakeTokens,
              [smartConAdd],
              [stakeTokens],
              {
                from: staker1
              }
            );
            await tk.approve(ps.address, stakeTokens, {
              from: staker2
            });
            await ps.depositAndStake(
              stakeTokens,
              [smartConAdd],
              [stakeTokens],
              {
                from: staker2
              }
            );
          });

          describe('Purchase Cover With Ether', function() {
            const coverHolder = member3;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('6.21 should be able to purchase cover ', async function() {
              initialStakeCommissionOfS1 = await ps.stakerReward.call(staker1);
              initialStakeCommissionOfS2 = await ps.stakerReward.call(staker2);
              coverDetails[4] = 7972408607003;
              var vrsdata = await getQuoteValues(
                coverDetails,
                toHex('ETH'),
                coverPeriod,
                smartConAdd,
                qt.address
              );

              await P1.makeCoverBegin(
                smartConAdd,
                toHex('ETH'),
                coverDetails,
                coverPeriod,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder, value: coverDetails[1]}
              );
              await assertRevert(
                P1.makeCoverBegin(
                  smartConAdd,
                  toHex('ETH'),
                  coverDetails,
                  coverPeriod,
                  vrsdata[0],
                  vrsdata[1],
                  vrsdata[2],
                  {from: coverHolder, value: coverDetails[1]}
                )
              );
            });

            it('6.22 staker gets commission', async function() {
              await ps.processPendingActions('100');
              const commission =
                ((coverDetails[2] * (await td.stakerCommissionPer())) / 100 -
                  1) /
                stakers.length;
              (await ps.stakerReward.call(staker1))
                .toString()
                .should.be.equal(
                  new BN(initialStakeCommissionOfS1.toString())
                    .add(new BN(commission.toFixed(0).toString()))
                    .toString()
                );

              (await ps.stakerReward.call(staker2))
                .toString()
                .should.be.equal(
                  new BN(initialStakeCommissionOfS2.toString())
                    .add(new BN(commission.toFixed(0).toString()))
                    .toString()
                );
            });
          });

          describe('Purchase Cover With NXM', function() {
            const coverHolder = member4;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('6.23 should be able to purchase cover', async function() {
              initialStakeCommissionOfS1 = await ps.stakerReward.call(staker1);
              initialStakeCommissionOfS2 = await ps.stakerReward.call(staker2);
              let newCDetails = coverDetails.slice();
              newCDetails[3] = (await latestTime()) - 2;
              await assertRevert(
                qt.makeCoverUsingNXMTokens(
                  newCDetails,
                  coverPeriod,
                  toHex('ETH'),
                  smartConAdd,
                  vrs[0],
                  vrs[1],
                  vrs[2],
                  {from: coverHolder}
                )
              );
              await assertRevert(
                qt.makeCoverUsingNXMTokens(
                  coverDetails,
                  coverPeriod,
                  toHex('ETH'),
                  smartConAdd,
                  27,
                  vrs[1],
                  vrs[2],
                  {from: coverHolder}
                )
              );
              coverDetails[4] = 7972408607004;
              var vrsdata = await getQuoteValues(
                coverDetails,
                toHex('ETH'),
                coverPeriod,
                smartConAdd,
                qt.address
              );
              await qt.makeCoverUsingNXMTokens(
                coverDetails,
                coverPeriod,
                toHex('ETH'),
                smartConAdd,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder}
              );
            });
            it('6.24 staker gets commission', async function() {
              await ps.processPendingActions('100');
              const commission =
                ((coverDetails[2] * (await td.stakerCommissionPer())) / 100 -
                  1) /
                stakers.length;
              (await ps.stakerReward.call(staker1))
                .toString()
                .should.be.equal(
                  new BN(initialStakeCommissionOfS1.toString())
                    .add(new BN(commission.toFixed(0).toString()))
                    .toString()
                );

              (await ps.stakerReward.call(staker2))
                .toString()
                .should.be.equal(
                  new BN(initialStakeCommissionOfS2.toString())
                    .add(new BN(commission.toFixed(0).toString()))
                    .toString()
                );
            });
          });

          describe('Purchase Cover With DAI', function() {
            const coverHolder = member5;
            let initialPoolBalanceOfCA;
            let initialStakeCommissionOfS1;
            let initialStakeCommissionOfS2;
            it('6.25 should able to purchase cover using currency assest i.e. DAI ', async function() {
              initialStakeCommissionOfS1 = await ps.stakerReward.call(staker1);
              initialStakeCommissionOfS2 = await ps.stakerReward.call(staker2);
              await cad.approve(P1.address, coverDetailsDai[1], {
                from: coverHolder
              });
              coverDetailsDai[4] = 7972408607005;
              var vrsdata = await getQuoteValues(
                coverDetailsDai,
                toHex('DAI'),
                coverPeriod,
                smartConAdd,
                qt.address
              );
              await P1.makeCoverUsingCA(
                smartConAdd,
                toHex('DAI'),
                coverDetailsDai,
                coverPeriod,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder}
              );
            });
            it('6.26 staker gets commission', async function() {
              await ps.processPendingActions('100');
              const commission =
                ((coverDetailsDai[2] * (await td.stakerCommissionPer())) / 100 -
                  1) /
                stakers.length;
              (await ps.stakerReward.call(staker1))
                .toString()
                .should.be.equal(
                  new BN(initialStakeCommissionOfS1.toString())
                    .add(new BN(commission.toFixed(0).toString()))
                    .toString()
                );
              (await ps.stakerReward.call(staker2))
                .toString()
                .should.be.equal(
                  new BN(initialStakeCommissionOfS2.toString())
                    .add(new BN(commission.toFixed(0).toString()))
                    .toString()
                );
            });
            it('6.27 should able to purchase cover with cover period less than 60 ', async function() {
              let coverLen = await qd.getCoverLength();
              let totalSASC = await qd.getTotalSumAssuredSC(
                smartConAdd,
                toHex('DAI')
              );
              coverDetailsLess[4] = 7972408607006;
              var vrsdata = await getQuoteValues(
                coverDetailsLess,
                toHex('DAI'),
                coverPeriodLess,
                smartConAdd,
                qt.address
              );
              await cad.approve(P1.address, coverDetailsLess[1], {
                from: coverHolder
              });
              await P1.makeCoverUsingCA(
                smartConAdd,
                toHex('DAI'),
                coverDetailsLess,
                coverPeriodLess,
                vrsdata[0],
                vrsdata[1],
                vrsdata[2],
                {from: coverHolder}
              );
              new BN(coverLen.toString())
                .add(new BN((1).toString()))
                .toString()
                .should.be.equal((await qd.getCoverLength()).toString());
              coverPeriodLess
                .toString()
                .should.be.equal(
                  (
                    await qd.getCoverPeriod((await qd.getCoverLength()) - 1)
                  ).toString()
                );
              new BN(totalSASC.toString())
                .add(new BN(coverDetailsLess[0].toString()))
                .toString()
                .should.be.equal(
                  (
                    await qd.getTotalSumAssuredSC(smartConAdd, toHex('DAI'))
                  ).toString()
                );
            });
          });
        });
      });
    });

    describe('If user is not a member', function() {
      it('6.28 should return -1 if user have no holded Covers', async function() {
        let holdedId = await qt.getRecentHoldedCoverIdStatus(member1);
        holdedId.toString().should.be.equal((-1).toString());
      });
      it('6.29 should revert if member', async function() {
        const totalFee = new BN(fee.toString()).add(
          new BN(coverDetails[1].toString())
        );
        coverDetails[4] = 7972408607214;
        var vrsdata = await getQuoteValues(
          coverDetails,
          toHex('ETH'),
          coverPeriod,
          smartConAdd,
          qt.address
        );
        await assertRevert(
          qt.initiateMembershipAndCover(
            smartConAdd,
            toHex('ETH'),
            coverDetails,
            coverPeriod,
            vrsdata[0],
            vrsdata[1],
            vrsdata[2],
            {from: member1, value: totalFee}
          )
        );
      });
      describe('if do not want to join membership', function() {
        it('6.30 reverts', async function() {
          await assertRevert(
            P1.makeCoverBegin(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              {from: notMember, value: coverDetails[1]}
            )
          );

          await assertRevert(
            qt.makeCoverUsingNXMTokens(
              coverDetails,
              coverPeriod,
              toHex('ETH'),
              smartConAdd,
              vrs[0],
              vrs[1],
              vrs[2],
              {from: notMember}
            )
          );

          await assertRevert(
            P1.makeCoverUsingCA(
              smartConAdd,
              toHex('DAI'),
              coverDetailsDai,
              coverPeriod,
              vrs_dai[0],
              vrs_dai[1],
              vrs_dai[2],
              {from: notMember}
            )
          );
          const totalFee = new BN(fee.toString()).add(
            new BN(coverDetails[1].toString())
          );
          coverDetails[4] = 7972408607313;
          var vrsdata = await getQuoteValues(
            coverDetails,
            toHex('ETH'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrsdata[0],
              vrsdata[1],
              vrsdata[2],
              {from: notMember, value: 1}
            )
          );

          coverDetails[4] = 7972408607813;
          var vrsdata = await getQuoteValues(
            coverDetails,
            toHex('ETH'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              10,
              vrsdata[1],
              vrsdata[2],
              {from: notMember, value: totalFee}
            )
          );
          coverDetails[4] = 7972408607007;
          var vrsdata = await getQuoteValues(
            coverDetails,
            toHex('ETH'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await qt.initiateMembershipAndCover(
            smartConAdd,
            toHex('ETH'),
            coverDetails,
            coverPeriod,
            vrsdata[0],
            vrsdata[1],
            vrsdata[2],
            {from: notMember, value: totalFee}
          );
          await cad.transfer(qt.address, toWei(10));

          let newQt = await Quotation.new();
          let oldMR = await MemberRoles.at(
            await nxms.getLatestAddress(toHex('MR'))
          );
          let oldGv = await Governance.at(
            await nxms.getLatestAddress(toHex('GV'))
          );
          actionHash = encode1(
            ['bytes2[]', 'address[]'],
            [[toHex('QT')], [newQt.address]]
          );

          await gvProp(29, actionHash, oldMR, oldGv, 2);
          (await nxms.getLatestAddress(toHex('QT'))).should.be.equal(
            newQt.address
          );
          qt = newQt;

          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              toHex('ETH'),
              coverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              {from: notMember, value: totalFee}
            )
          );
          let hcl = await qd.getUserHoldedCoverLength(notMember);
          await qt.kycVerdict(notMember, false);
          await mr.payJoiningFee(notMember, {
            from: notMember,
            value: fee
          });
          await mr.kycVerdict(notMember, false);
        });
      });
      describe('if want to join membership', function() {
        it('6.31 should be able to join membership and purchase cover with ETH', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember1
          });
          const totalFee = new BN(fee.toString()).add(
            new BN(coverDetails[1].toString())
          );
          coverDetails[4] = 7972408607008;
          var vrsdata = await getQuoteValues(
            coverDetails,
            toHex('ETH'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await qt.initiateMembershipAndCover(
            smartConAdd,
            toHex('ETH'),
            coverDetails,
            coverPeriod,
            vrsdata[0],
            vrsdata[1],
            vrsdata[2],
            {from: newMember1, value: totalFee}
          );
          let holdedId = await qt.getRecentHoldedCoverIdStatus(newMember1);
          holdedId.toNumber().should.be.above(0);
          await qt.kycVerdict(newMember1, true);
        });
        it('6.32 should be able to join membership and purchase cover with DAI', async function() {
          await tk.approve(tc.address, UNLIMITED_ALLOWANCE, {
            from: newMember2
          });
          await cad.transfer(newMember2, tokenDai);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: newMember2
          });
          coverDetailsDai[4] = 7972408607009;
          var vrsdata = await getQuoteValues(
            coverDetailsDai,
            toHex('DAI'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await qt.initiateMembershipAndCover(
            smartConAdd,
            toHex('DAI'),
            coverDetailsDai,
            coverPeriod,
            vrsdata[0],
            vrsdata[1],
            vrsdata[2],
            {from: newMember2, value: fee}
          );
          const hcid = await qd.getUserHoldedCoverByIndex(newMember2, 0);
          await qt.kycVerdict(newMember2, true);
        });

        it('6.34 should revert if wallet address is not set', async function() {
          let oldMR = await MemberRoles.at(
            await nxms.getLatestAddress(toHex('MR'))
          );
          let oldGv = await Governance.at(
            await nxms.getLatestAddress(toHex('GV'))
          );
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
          const totalFee = new BN(fee.toString()).add(
            new BN(coverDetails[1].toString())
          );
          await cad.transfer(newMember5, coverDetailsDai[1]);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: newMember5
          });
          coverDetailsDai[4] = 7972408607012;
          var vrsdata = await getQuoteValues(
            coverDetailsDai,
            toHex('DAI'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await qt.initiateMembershipAndCover(
            smartConAdd,
            toHex('DAI'),
            coverDetailsDai,
            coverPeriod,
            vrsdata[0],
            vrsdata[1],
            vrsdata[2],
            {from: newMember5, value: fee}
          );
          await assertRevert(qt.kycVerdict(newMember5, true));
          actionHash = encode(
            'updateOwnerParameters(bytes8,address)',
            'MSWALLET',
            owner
          );
          await gvProp(28, actionHash, oldMR, oldGv, 3);
          (await td.walletAddress()).should.be.equal(owner);
        });

        it('6.36 should revert if quote validity expires', async function() {
          const newCoverDetails = coverDetails.slice();
          const validity = await latestTime();
          newCoverDetails[3] = validity - 2;
          const totalFee = new BN(fee.toString()).add(
            new BN(newCoverDetails[1].toString())
          );
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              toHex('ETH'),
              newCoverDetails,
              coverPeriod,
              vrs[0],
              vrs[1],
              vrs[2],
              {from: notMember, value: totalFee}
            )
          );
        });

        it('6.37 should get membership but not cover if quote expires for DAI', async function() {
          await assertRevert(
            qt.initiateMembershipAndCover(
              smartConAdd,
              toHex('DAI'),
              coverDetailsDai,
              coverPeriod,
              vrs_dai[0],
              vrs_dai[1],
              vrs_dai[2],
              {from: notMember, value: fee}
            )
          );

          await cad.transfer(notMember, coverDetailsDai[1]);
          await cad.approve(qt.address, coverDetailsDai[1], {
            from: notMember
          });
          coverDetailsDai[4] = 7972408607014;
          var vrsdata = await getQuoteValues(
            coverDetailsDai,
            toHex('DAI'),
            coverPeriod,
            smartConAdd,
            qt.address
          );
          await qt.initiateMembershipAndCover(
            smartConAdd,
            toHex('DAI'),
            coverDetailsDai,
            coverPeriod,
            vrsdata[0],
            vrsdata[1],
            vrsdata[2],
            {from: notMember, value: fee}
          );
          const hcid = await qd.getUserHoldedCoverByIndex(notMember, 1);
          const newCoverDetails = coverDetailsDai.slice();
          newCoverDetails[3] = (await latestTime()) - 3;
          await qd.changeHoldedCoverDetails(hcid, newCoverDetails);
          await qt.kycVerdict(notMember, true);
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
      await increaseTimeTo(
        new BN(validityofCover.toString()).add(new BN((1).toString()))
      );
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
      newSumAssured
        .toString()
        .should.be.equal(
          new BN(initialSumAssured.toString())
            .sub(new BN((1).toString()))
            .toString()
        );
    });
    it('6.42 should change cover status', async function() {
      (await qd.getCoverStatusNo(1)).toString().should.be.equal((3).toString());
    });
    it('6.43 should unlock locked cover note tokens', async function() {
      const unLockedCN = new BN(BN_10.toString())
        .mul(new BN(coverDetails[2].toString()))
        .div(new BN(BN_100.toString()));
      (await tk.balanceOf(member3))
        .toString()
        .should.be.equal(
          new BN(initialTokenBalance.toString())
            .add(new BN(unLockedCN.toString()))
            .toString()
        );
    });
  });

  describe('Misc', function() {
    describe('Change product params if owner', function() {
      it('6.47 only governance call should be able to change Profit Margin', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode('updateUintParameters(bytes8,uint)', 'PM', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.pm()) / 1).should.be.equal(4);
      });
      it('6.48 only governance call should be able to change STLP', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode('updateUintParameters(bytes8,uint)', 'STLP', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.stlp()) / 1).should.be.equal(4);
      });
      it('6.49 only governance call should be able to change STL', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode('updateUintParameters(bytes8,uint)', 'STL', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.stl()) / 1).should.be.equal(4);
      });
      it('6.50 only governance call should be able to change minimum cover period', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode('updateUintParameters(bytes8,uint)', 'QUOMIND', 4);
        await gvProp(23, actionHash, oldMR, oldGv, 2);
        ((await qd.minDays()) / 1).should.be.equal(4);
      });
    });
    describe('if not internal contract address', function() {
      it('6.51 should not be able to change master address', async function() {
        await assertRevert(
          qd.changeMasterAddress(qd.address, {from: notMember})
        );
        await assertRevert(
          qt.changeMasterAddress(qd.address, {from: notMember})
        );
      });
      it('6.52 should not be able to change cover status number', async function() {
        const CID = await qd.getAllCoversOfUser(member3);
        await assertRevert(
          qd.changeCoverStatusNo(CID[0], 1, {from: notMember})
        );
      });
      it('6.53 should fail add mcr if lower threshold not reached', async function() {
        await mcr.addMCRData(
          parseInt((await getValue(toWei(2), pd, mcr)) / 2),
          toWei(100),
          toWei(2),
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011
        );
        var APIID = await pd.allAPIcall((await pd.getApilCallLength()) - 1);
        (await pd.getApiIdTypeOf(APIID)).should.be.equal('0x4d435246');
      });
      it('6.54 should throw if call kycVerdict with non authorised address', async function() {
        await assertRevert(qt.kycVerdict(member1, true, {from: member1}));
      });
      it('6.55 should not able to update quoatation parameters directly', async function() {
        await assertRevert(qd.updateUintParameters(toHex('STLP'), 1));
      });
    });
  });
});
