const MemberRoles = artifacts.require('MemberRoles');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const NXMaster = artifacts.require('NXMaster');

const { assertRevert } = require('./utils/assertRevert');
const { ether } = require('./utils/ether');

let tf;
let mr;
let nxms;
const fee = ether(0.002);

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Membership', function([owner, member1, member2]) {
  before(async function() {
    nxms = await NXMaster.deployed();
    tf = await TokenFunctions.deployed();
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
  });
  describe('Buy membership', function() {
    describe('if paid joining fee', function() {
      it('should be able to join as member', async function() {
        await mr.payJoiningFee(member1, { from: member1, value: fee });
        await mr.kycVerdict(member1, true, { from: owner });
        (await mr.checkRole(member1, 2)).should.equal(true);
      });
    });
    describe('if not paid joining fee', function() {
      it('reverts', async function() {
        await assertRevert(
          mr.payJoiningFee(member2, { from: member2, value: fee - 1e15 })
        );
        (await mr.checkRole(member2, 2)).should.equal(false);
      });
    });
  });
  // console.log('yoy', await mr.checkRole(member1, 2));
  describe('Withdraw membership', function() {
    describe('If met Withdraw membership conditions', function() {
      it('should be able to withdraw membership', async function() {
        await mr.withdrawMembership({ from: member1 });
        (await mr.checkRole(member1, 2)).should.equal(false);
      });
    });
    describe('Cannot withdrawn if already withdrawn', function() {
      it('reverts', async function() {
        await assertRevert(mr.withdrawMembership({ from: member1 }));
      });
    });
  });
});
