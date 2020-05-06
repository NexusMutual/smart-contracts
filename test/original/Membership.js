const { defaultSender, web3 } = require('@openzeppelin/test-environment');
const { expectRevert, ether } = require('@openzeppelin/test-helpers');

const setup = require('../integration/setup');
const { accounts } = require('../utils');

const fee = ether('0.002');
const owner = defaultSender;
const { members: [member1, member2] } = accounts;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

describe.only('Membership', function () {

  this.timeout(0);

  describe('Buy membership', function () {
    describe('if paid joining fee', function () {

      beforeEach(setup);

      it('2.1 should be able to join as member', async function () {
        await this.mr.payJoiningFee(member1, { from: member1, value: fee });
        await this.mr.kycVerdict(member1, true, { from: owner });
        (await this.mr.checkRole(member1, 2)).should.equal(true);
      });

      it('2.2 reverts', async function () {
        await expectRevert.unspecified(
          this.mr.payJoiningFee(member2, { from: member2, value: fee - 1e15 }),
        );
        (await this.mr.checkRole(member2, 2)).should.equal(false);
      });

    });
  });

  describe('Withdraw membership', function () {
    describe('If met Withdraw membership conditions', function () {

      beforeEach(setup);

      it('2.3 should be able to withdraw membership', async function () {
        await this.mr.payJoiningFee(member1, { from: member1, value: fee });
        await this.mr.kycVerdict(member1, true, { from: owner });
        await this.mr.withdrawMembership({ from: member1 });
        (await this.mr.checkRole(member1, 2)).should.equal(false);
      });

      it('2.4 reverts', async function () {
        await expectRevert.unspecified(this.mr.withdrawMembership({ from: member1 }));
      });

      it('2.5 reverts', async function () {
        await expectRevert.unspecified(this.mr.switchMembership(member2, { from: member1 }));
      });

    });
  });

  describe('If met switching membership conditions', function () {

    beforeEach(setup);

    it('2.6 should be able to switch membership', async function () {
      await this.mr.payJoiningFee(member1, { from: member1, value: fee });
      await this.mr.kycVerdict(member1, true, { from: owner });
      (await this.mr.checkRole(member1, 2)).should.equal(true);
      await this.tk.transfer(member1, ether('2'));
      await this.tk.approve(this.mr.address, ether('2'), { from: member1 });
      await this.mr.switchMembership(member2, { from: member1 });
      (await this.mr.checkRole(member1, 2)).should.equal(false);
      (await this.mr.checkRole(member2, 2)).should.equal(true);
      ((await this.tk.balanceOf(member1)) / 1).should.equal(0);
      ((await this.tk.balanceOf(member2)) / 1).should.equal(ether('2') / 1);
    });
  });

});
