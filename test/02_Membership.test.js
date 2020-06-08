const MemberRoles = artifacts.require('MemberRoles');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');

const {assertRevert} = require('./utils/assertRevert');
const {ether} = require('./utils/ethTools');

let tf;
let mr;
let nxms;
let tk;
const fee = ether(0.002);

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Membership', function([owner, member1, member2]) {
  before(async function() {
    tf = await TokenFunctions.deployed();
    nxms = await NXMaster.at(await tf.ms());
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    tk = await NXMToken.at(await nxms.tokenAddress());
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
  });
  describe('Buy membership', function() {
    describe('if paid joining fee', function() {
      it('2.1 should be able to join as member', async function() {
        await mr.payJoiningFee(member1, {from: member1, value: fee});
        await mr.kycVerdict(member1, true, {from: owner});
        (await mr.checkRole(member1, 2)).should.equal(true);
      });
    });
    describe('if not paid joining fee', function() {
      it('2.2 reverts', async function() {
        await assertRevert(
          mr.payJoiningFee(member2, {from: member2, value: fee - 1e15})
        );
        (await mr.checkRole(member2, 2)).should.equal(false);
      });
    });
  });
  describe('Withdraw membership', function() {
    describe('If met Withdraw membership conditions', function() {
      it('2.3 should be able to withdraw membership', async function() {
        await mr.withdrawMembership({from: member1});
        (await mr.checkRole(member1, 2)).should.equal(false);
      });
    });
    describe('Cannot withdrawn if already withdrawn', function() {
      it('2.4 reverts', async function() {
        await assertRevert(mr.withdrawMembership({from: member1}));
      });
    });
    describe('Cannot switch membership if already withdrawn', function() {
      it('2.5 reverts', async function() {
        await assertRevert(mr.switchMembership(member2, {from: member1}));
      });
    });
  });
  describe('If met switching membership conditions', function() {
    before(async function() {
      await mr.payJoiningFee(member1, {from: member1, value: fee});
      await mr.kycVerdict(member1, true, {from: owner});
      (await mr.checkRole(member1, 2)).should.equal(true);
      await tk.transfer(member1, ether(2));
    });
    it('2.6 should be able to switch membership', async function() {
      await tk.approve(mr.address, ether(2), {from: member1});
      await mr.switchMembership(member2, {from: member1});
      (await mr.checkRole(member1, 2)).should.equal(false);
      (await mr.checkRole(member2, 2)).should.equal(true);
      ((await tk.balanceOf(member1)) / 1).should.equal(0);
      ((await tk.balanceOf(member2)) / 1).should.equal(ether(2) / 1);
    });
  });
});
