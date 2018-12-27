const MemberRoles = artifacts.require('MemberRoles');
const TokenFunctions = artifacts.require('TokenFunctions');
const NXMaster = artifacts.require('NXMaster');

const { assertRevert } = require('./utils/assertRevert');
const { ether } = require('./utils/ether');

let tf;
let mr;
let nxms;

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
    const fee = ether(0.002);
    describe('if paid joining fee', function() {
      it('should be able to join as member', async function() {
        await tf.payJoiningFee(member1, { from: member1, value: fee });
        await tf.kycVerdict(member1, true, { from: owner });
        (await mr.checkRole(member1, 2)).should.equal(true);
      });
    });
    describe('if not paid joining fee', function() {
      it('reverts', async function() {
        await assertRevert(
          tf.payJoiningFee(member2, { from: member2, value: fee - 1e15 })
        );
        (await mr.checkRole(member2, 2)).should.equal(false);
      });
    });
  });

  describe('Withdraw membership', function() {
    describe('If met Withdraw membership conditions', function() {
      it('should be able to withdraw membership', async function() {
        await tf.withdrawMembership({ from: member1 });
        (await mr.checkRole(member1, 2)).should.equal(false);
      });
    });
    describe('If not met Withdraw membership conditions', function() {
      it('reverts', async function() {
        await assertRevert(tf.withdrawMembership({ from: member1 }));
      });
    });
  });
});
