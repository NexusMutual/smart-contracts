const MemberRoles = artifacts.require('MemberRoles');
const NXMToken2 = artifacts.require('NXMToken2');
const NXMTokenData = artifacts.require('NXMTokenData');
const fee = web3.toWei(0.002);
const member1 = web3.eth.accounts[1];
const member2 = web3.eth.accounts[2];
const member3 = web3.eth.accounts[3];
let nxmtk2;
let mr;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken2', function() {
  const initialFounderTokens = new BigNumber(15e5);
  before(function() {
    NXMToken2.deployed()
      .then(function(instance) {
        nxmtk2 = instance;
        return MemberRoles.deployed();
      })
      .then(function(instance) {
        mr = instance;
        return NXMTokenData.deployed();
      })
      .then(function(instance) {
        nxmtd = instance;
      });
  });
  it('should be able to join membership', async function() {
    await mr.addNewMemberRole(
      '0x4d656d626572',
      'Member of Nexus Mutual',
      nxmtk2.address,
      false
    );
    let checked = true;
    if (
      (await mr.checkRoleIdByAddress(member1, 3)) ||
      (await mr.checkRoleIdByAddress(member2, 3)) ||
      (await mr.checkRoleIdByAddress(member3, 3))
    ) {
      checked = false;
    }
    checked.should.equal(true);
    await nxmtk2.payJoiningFee({ from: member1, value: fee });
    await nxmtk2.payJoiningFee({ from: member2, value: fee });
    await nxmtk2.payJoiningFee({ from: member3, value: fee });
    const joinmem1 = await mr.checkRoleIdByAddress(member1, 3);
    const joinmem2 = await mr.checkRoleIdByAddress(member2, 3);
    const joinmem3 = await mr.checkRoleIdByAddress(member3, 3);
    joinmem1.should.equal(true);
    joinmem2.should.equal(true);
    joinmem3.should.equal(true);
  });
  it('should be able to withdraw membership', async function() {
    await nxmtk2.withdrawMembership({ from: member1 });
    const withmem = await mr.checkRoleIdByAddress(member1, 3);
    withmem.should.equal(false);
  });
  it('should be able to rejoin membership', async function() {
    const mem = await mr.checkRoleIdByAddress(member1, 3);
    mem.should.equal(false);
    await nxmtk2.payJoiningFee({ from: member1, value: fee });
    const joinmem = await mr.checkRoleIdByAddress(member1, 3);
    joinmem.should.equal(true);
  });
  it('should return correct amount of initialFounderTokens', async function() {
    const checkFounderTokens = await nxmtd.getInitialFounderTokens();
    initialFounderTokens.should.be.bignumber.equal(checkFounderTokens);
  });
  it('should be able to change CanAddMemberAddress', async function() {
    await nxmtk2.changeCanAddMemberAddress(nxmtk2.address);
    nxmtk2.address.should.be.equal(await mr.getAuthrizedMemberAgainstRole(3));
    nxmtk2.address.should.be.equal(await mr.getAuthrizedMemberAgainstRole(4));
  });
});
