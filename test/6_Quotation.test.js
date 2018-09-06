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
  coverHolder,
  notMember
]) {
  const BN_100 = new BigNumber(100);
  const BN_5 = new BigNumber(5);
  const BN_20 = new BigNumber(20);
  const BN_95 = new BigNumber(95);
  const tokenAmount = ether(1);
  const tokenDai = ether(4);

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

    describe('If user is not a member', function() {
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
            { from: coverHolder, value: coverDetails[1] }
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
            { from: coverHolder }
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
            { from: coverHolder }
          )
        );
      });
    });

    describe('If user is a member', function() {
      before(async function() {
        await nxmtk2.payJoiningFee({ from: member1, value: fee });
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
              { from: coverHolder, value: coverDetails[1] - 1 }
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
              { from: coverHolder }
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
              { from: coverHolder }
            )
          );
        });
      });
    });
  });
});
