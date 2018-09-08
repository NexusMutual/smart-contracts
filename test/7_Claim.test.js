const Pool1 = artifacts.require('Pool1');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const ClaimsReward = artifacts.require('ClaimsReward');
const QuotationData = artifacts.require('QuotationData');
const Quotation = artifacts.require('Quotation');
const NXMTokenData = artifacts.require('NXMTokenData');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const expectEvent = require('./utils/expectEvent');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const CA_ETH = '0x45544800';
const fee = ether(0.002);
const QE = '0xb24919181daead6635e613576ca11c5aa5a4e133';
const PID = 0;
const PNAME = '0x5343430000000000';
const PHASH = 'Smart Contract Cover';
const smartConAdd = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';
const coverPeriod = 61;
const coverDetails = [1, 3362445813369838, 744892736679184, 7972408607];
const v = 28;
const r = '0x66049184fb1cf394862cca6c3b2a0c462401a671d0f2b20597d121e56768f90a';
const s = '0x4c28c8f8ff0548dd3a41d7c75621940eb4adbac13696a2796e98a59691bf53ff';

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

contract('Claim', function([
  owner,
  member1,
  member2,
  member3,
  member4,
  member5,
  notMember
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
    td = await NXMTokenData.deployed();
  });
  describe('Submit Claim', function() {
    describe('if not member', function() {
      it('reverts', async function() {
        // revert it plox
      });
    });

    describe('if member', function() {
      describe('if does not purchased cover', function() {
        it('reverts', async function() {
          // revert plox
        });
      });

      describe('if does hold a cover', function() {
        describe('if member is not cover owner', function() {
          it('reverts', async function() {
            // revert plox
          });
        });

        describe('if member is not cover owner', function() {
          describe('if cover expires', function() {
            it('reverts', async function() {
              // revert plox
            });
          });

          describe('if cover does not expires', function() {
            describe('if claim rejected 5 times', function() {
              it('reverts', async function() {
                // revert plox
              });
            });

            describe('if claim is already submitted', function() {
              it('reverts', async function() {
                // revert plox
              });
            });

            describe('if claim is already accepted', function() {
              it('should be able to submit claim', async function() {
                // submit plox
              });
            });

            describe('if claim is not submitted yet', function() {
              it('should be able to submit claim', async function() {
                // submit plox
              });
            });
          });
        });
      });
    });
  });
});
