const MemberRoles = artifacts.require('MemberRoles');
const TokenFunctions = artifacts.require('TokenFunctions');

const { assertRevert } = require('./utils/assertRevert');
const { ether } = require('./utils/ether');

let tf;
let mr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken:Membership', function([owner, member1, member2]) {
  before(async function() {
    tf = await TokenFunctions.deployed();
    mr = await MemberRoles.deployed();
  });
  describe('Buy membership', function() {
    const fee = ether(0.002);
    describe('if paid joining fee', function() {
      it('should be able to join as member', async function() {
        await tf.payJoiningFee(member1, { from: member1, value: fee });
        await tf.kycVerdict(member1, true, { from: owner });
        (await mr.checkRoleIdByAddress(member1, 3)).should.equal(true);
      });
    });
    describe('if not paid joining fee', function() {
      it('reverts', async function() {
        await assertRevert(
          tf.payJoiningFee(member2, { from: member2, value: fee - 1e15 })
        );
        (await mr.checkRoleIdByAddress(member2, 3)).should.equal(false);
      });
    });
  });

  describe('Withdraw membership', function() {
    describe('If met Withdraw membership conditions', function() {
      it('should be able to withdraw membership', async function() {
        await tf.withdrawMembership({ from: member1 });
        (await mr.checkRoleIdByAddress(member1, 3)).should.equal(false);
      });
    });
    describe('If not met Withdraw membership conditions', function() {
      it('reverts', async function() {
        await assertRevert(tf.withdrawMembership({ from: member1 }));
      });
    });
  });
});
