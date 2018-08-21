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
        before(function() {
                NXMToken2.deployed().then(function(instance) {
                        nxmtk2 = instance;
                        return MemberRoles.deployed();
                }).then(function(instance) {
                        mr = instance;
                });
        });
	it('should able to join membership', async function () {
		await mr.addNewMemberRole("0x4d656d626572","Member of Nexus Mutual", nxmtk2.address, false);
		await nxmtk2.payJoiningFee({from: member1, value:fee});
		await nxmtk2.payJoiningFee({from: member2, value:fee});
		let joinmem1 = await mr.checkRoleIdByAddress(member1,3);
		let joinmem2 = await mr.checkRoleIdByAddress(member2,3);
		joinmem1.should.equal(true);
		joinmem2.should.equal(true);
	});
	it('should able to withdraw membership', async function () {
		await nxmtk2.withdrawMembership({from: member1});
		let withmem = await mr.checkRoleIdByAddress(member1,3);
		withmem.should.equal(false);
	});
	it('should able to rejoin membership', async function () {
		await nxmtk2.payJoiningFee({from: member1, value:fee});
		let joinmem = await mr.checkRoleIdByAddress(member1,3);
		joinmem.should.equal(true);
	});
});
