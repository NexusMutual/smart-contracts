const MemberRoles = artifacts.require("MemberRoles");
const NXMToken2 = artifacts.require("NXMToken2");
const fee = web3.toWei(0.002);
const member1 = web3.eth.accounts[1];
const member2 = web3.eth.accounts[2];
let nxmtk2;
let mr;

require('chai')
   .should();

contract("02_NXMToken2", function () {
	it('should able to join membership', async function () {
		this.timeout(0);
		mr = await MemberRoles.deployed();
		nxmtk2 = await NXMToken2.deployed();
		await mr.addNewMemberRole("0x4d656d626572","Member of Nexus Mutual", nxmtk2.address, false);
		await nxmtk2.payJoiningFee({from: member1, value:fee});
		await nxmtk2.payJoiningFee({from: member2, value:fee});
		let joinmem1 = await mr.checkRoleIdByAddress(member1,3);
		let joinmem2 = await mr.checkRoleIdByAddress(member2,3);
		joinmem1.should.equal(true);
		joinmem2.should.equal(true);
	});
	it('should able to withdraw membership', async function () {
		this.timeout(0);
		await nxmtk2.withdrawMembership({from: member1});
		let withmem = await mr.checkRoleIdByAddress(member1,3);
		withmem.should.equal(false);
	});
	it('should able to rejoin membership', async function () {
		this.timeout(0);
		await nxmtk2.payJoiningFee({from: member1, value:fee});
		let joinmem = await mr.checkRoleIdByAddress(member1,3);
		joinmem.should.equal(true);
	});
});
