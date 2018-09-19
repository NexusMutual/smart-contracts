const MemberRoles = artifacts.require('MemberRoles');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const NXMTokenData = artifacts.require('NXMTokenData');
const Pool1 = artifacts.require('Pool1');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');
const expectEvent = require('./utils/expectEvent');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');

const ETH = '0x455448';
const CLA = '0x434c41';
const stakedContract = '0xd0a6e6c54dbc68db5db3a091b171a77407ff7ccf';

let nxmtk2;
let nxmtk1;
let nxmtd;
let P1;
let mr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Membership', function([
  owner,
  member1,
  member2,
  member3,
  notMember
]) {
  before(async function() {
    P1 = await Pool1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    nxmtd = await NXMTokenData.deployed();
    mr = await MemberRoles.deployed();
  });
  describe('Buy membership', function() {
    const fee = ether(0.002);
    describe('if paid joining fee', function() {
      it('should be able to join as member', async function() {
        await nxmtk2.payJoiningFee(member1, { from: member1, value: fee });
        (await mr.checkRoleIdByAddress(member1, 3)).should.equal(true);
      });
    });
    describe('if not paid joining fee', function() {
      it('reverts', async function() {
        await assertRevert(
          nxmtk2.payJoiningFee(member2, { from: member2, value: fee - 1e15 })
        );
        (await mr.checkRoleIdByAddress(member2, 3)).should.equal(false);
      });
    });
  });

  describe('Withdraw membership', function() {
    const fee = ether(0.002);
    describe('If met Withdraw membership conditions', function() {
      it('should be able to withdraw membership', async function() {
        await nxmtk2.withdrawMembership({ from: member1 });
        (await mr.checkRoleIdByAddress(member1, 3)).should.equal(false);
      });
    });
    describe('If not met Withdraw membership conditions', function() {
      it('reverts', async function() {
        await assertRevert(nxmtk2.withdrawMembership({ from: member1 }));
        //(await mr.checkRoleIdByAddress(member1, 3)).should.equal(false);
      });
    });
  });
});
