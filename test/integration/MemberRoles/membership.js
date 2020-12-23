const { accounts, web3 } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const Decimal = require('decimal.js');
const { toBN } = web3.utils;
const { coverToCoverDetailsArray, buyCover } = require('../utils/buyCover');
const { getQuoteSignature } = require('../utils/getQuote');
const { enrollMember, enrollClaimAssessor } = require('../utils/enroll');
const { hex } = require('../utils').helpers;

const [owner, member1, member2, member3, nonMember1, nonMember2] = accounts;
const coverTemplate = {
  amount: 1, // 1 eth
  price: '30000000000000000', // 0.03 eth
  priceNXM: '10000000000000000000', // 10 nxm
  expireTime: '8000000000',
  generationTime: '1600000000000',
  currency: hex('ETH'),
  period: 60,
  contractAddress: '0xC0FfEec0ffeeC0FfEec0fFEec0FfeEc0fFEe0000',
};

const ROLES = {
  MEMBER: 2,
  OWNER: 3,
};

const TOTAL_ROLES = 4;

describe('membership', function () {

  describe('enrollment', function () {
    it('enrolls members by paying joining fee confirming KYC', async function () {
      const { mr: memberRoles, tk: token } = this.contracts;

      const members = [member1, member2, member3];

      const { memberArray: membersBefore } = await memberRoles.members(ROLES.MEMBER);

      await enrollMember(this.contracts, members);
      for (const member of members) {
        const hasRole = await memberRoles.checkRole(member, ROLES.MEMBER);
        assert(hasRole);
        const roles = await memberRoles.roles(member);
        assert.equal(roles.length, TOTAL_ROLES);
        assert.equal(roles[0].toString(), ROLES.MEMBER.toString());
        for (let i = 1; i < TOTAL_ROLES; i++) {
          assert.equal(roles[i].toString(), '0');
        }
        const whitelisted = await token.whiteListed(member);
        assert(whitelisted);
      }

      const { memberArray } = await memberRoles.members(ROLES.MEMBER);
      assert.equal(memberArray.length, members.length + membersBefore.length);
    });
  });

  describe('roles metadata', function () {
    it('returns correct number of roles', async function () {
      const { mr: memberRoles, tk: token } = this.contracts;
      const totalRoles = await memberRoles.totalRoles();
      assert.equal(totalRoles.toString(), TOTAL_ROLES.toString(), 'Initial member roles not created');
    });
  });

  describe('withdrawMembership', function () {
    it('withdraws membership for current member', async function () {
      const { mr: memberRoles, tk: token } = this.contracts;

      const members = [member1, member2];
      const { memberArray: membersBefore } = await memberRoles.members(ROLES.MEMBER);
      await enrollMember(this.contracts, members);

      await memberRoles.withdrawMembership({ from: member1 });
      const hasRole = await memberRoles.checkRole(member1, ROLES.MEMBER);
      assert(!hasRole);
      const { memberArray } = await memberRoles.members(ROLES.MEMBER);
      assert.equal(memberArray.length, members.length - 1 + membersBefore.length);

      const whitelisted = await token.whiteListed(member1);
      assert(!whitelisted);
      const balance = await token.balanceOf(member1);
      assert.equal(balance.toString(), '0');
    });

    it('reverts when withdrawing membership for non-member', async function () {
      const { mr: memberRoles } = this.contracts;

      await expectRevert.unspecified(memberRoles.withdrawMembership({ from: nonMember1 }));
    });

    it('reverts when withdrawing membership for member with active covers', async function () {
      const { mr: memberRoles } = this.contracts;

      const member = member1;
      await enrollMember(this.contracts, [member]);
      await buyCover({ ...this.contracts, cover: coverTemplate, coverHolder: member });

      await expectRevert.unspecified(memberRoles.withdrawMembership({ from: member }));
    });
  });

  describe('switchMembership', function () {
    it('switches membership for current member', async function () {
      const { mr: memberRoles, tk: token } = this.contracts;

      const members = [member1, member2];
      const { memberArray: membersBefore } = await memberRoles.members(ROLES.MEMBER);
      await enrollMember(this.contracts, members);
      const nxmBalanceBefore = await token.balanceOf(member1);

      const newMemberAddress = nonMember1;

      await token.approve(memberRoles.address, -1, { from: member1 });
      await memberRoles.switchMembership(newMemberAddress, { from: member1 });
      const oldAddressHasRole = await memberRoles.checkRole(member1, ROLES.MEMBER);
      assert(!oldAddressHasRole);
      const newAddressHasRole = await memberRoles.checkRole(newMemberAddress, ROLES.MEMBER);
      assert(newAddressHasRole);

      // number of members stays the same
      const { memberArray } = await memberRoles.members(ROLES.MEMBER);
      assert.equal(memberArray.length, members.length + membersBefore.length);

      const oldAddressWhitelisted = await token.whiteListed(member1);
      assert(!oldAddressWhitelisted);
      const oldAddressBalance = await token.balanceOf(member1);
      assert.equal(oldAddressBalance.toString(), '0');

      const whitelisted = await token.whiteListed(newMemberAddress);
      assert(whitelisted);
      const nxmBalanceAfter = await token.balanceOf(newMemberAddress);
      assert.equal(nxmBalanceAfter.toString(), nxmBalanceBefore.toString());
    });

    it('reverts when switching membership for non-member', async function () {
      const { mr: memberRoles } = this.contracts;

      await expectRevert.unspecified(memberRoles.switchMembership(nonMember2, { from: nonMember1 }));
    });

    it('reverts when switching membership for member with active covers', async function () {
      const { mr: memberRoles } = this.contracts;

      const member = member1;
      await enrollMember(this.contracts, [member]);
      await buyCover({ ...this.contracts, cover: coverTemplate, coverHolder: member });

      await expectRevert.unspecified(memberRoles.switchMembership(nonMember1, { from: member }));
    });

    it('reverts when switching membership to an address that\'s already a member', async function () {
      const { mr: memberRoles } = this.contracts;

      await enrollMember(this.contracts, [member1, member2]);
      await expectRevert.unspecified(memberRoles.switchMembership(member2, { from: member1 }));
    });
  });
});
