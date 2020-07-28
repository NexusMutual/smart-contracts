// This is the automatically generated test file for contract: MemberRoles
// Other libraries might be imported here

const fs = require('fs');
const BigNumber = web3.BigNumber;
require('chai')
.use(require('chai-bignumber')(BigNumber))
.should();

const MemberRoles = artifacts.require('MemberRoles');
const {assertInvalid} = require('./utils/assertInvalid');

contract('MemberRoles', (accounts) => {
	// Coverage imporvement tests for MemberRoles
	describe('MemberRolesBlackboxTest', () => {
		it('call func launchedOn with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MemberRoles.new();
			const res = await obj.launchedOn();
			res.toString().should.be.equal("0");
		});

		it('call func memberAtIndex with blackbox random args', async () => {
			// Might adjust constructor accordingly
			const obj = await MemberRoles.new();
			const arg0 = "60757669020615360543459817708388636028228431451585199337683992662536095010908";
			const arg1 = "50997788057121171331422221560286834229282346024105270218066439450806293528449";
			await assertInvalid(obj.memberAtIndex(arg0, arg1));
		});

	});
});