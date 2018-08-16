const MemberRoles = artifacts.require("MemberRoles");
const NXMToken2 = artifacts.require("NXMToken2");
const member = web3.eth.accounts[4];
const fee = web3.toWei(0.002);
let nxmtk2;
let mr;

require('chai')
   .should();

contract('NXMToken2', function () {
	it('should able to join membership', async function () {
		mr = await MemberRoles.deployed();
		nxmtk2 = await NXMToken2.deployed();
		await mr.addNewMemberRole("0x4d656d626572","Member of Nexus Mutual", nxmtk2.address, false);
		await nxmtk2.payJoiningFee({from: member, value:fee});
		let joinmem = await mr.checkRoleIdByAddress(member,3);
		joinmem.should.equal(true);
	});
	it('should able to withdraw membership', async function () {
		await nxmtk2.withdrawMembership({from: member});
		let withmem = await mr.checkRoleIdByAddress(member,3);
		withmem.should.equal(false);
	});	
});
