const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const NXMaster = artifacts.require('NXMaster');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const assertRevert = require('./utils/assertRevert').assertRevert;
const encode = require('./utils/encoder.js').encode;
let mr;
let gv;
let pc;
let gbt;
let address;
let gvAddress;
let p1;
let mrLength;
let p2;
let mrLength1;

contract('MemberRoles', function([owner, member, other]) {
  before(async function() {
    nxms = await NXMaster.deployed();
    address = await nxms.getLatestAddress('MR');
    mr = await MemberRoles.at(address);
    address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
    tf = await TokenFunctions.deployed();
    await mr.payJoiningFee(owner, { value: 2000000000000000 });
    await mr.kycVerdict(owner, true);
  });

  it('should not allow unauthorized to change master address', async function() {
    await assertRevert(mr.changeMasterAddress(nxms.address, { from: other }));
    await mr.changeMasterAddress(nxms.address);
  });

  it('should have added initial member roles', async function() {
    const ab = await mr.totalRoles.call();
    assert.equal(ab, 3, 'Initial member roles not created');
  });

  it('should have added owner to AB', async function() {
    const roles = await mr.roles(owner);
    assert.equal(await mr.checkRole(owner, 1), true, 'Owner not added to AB');
    assert.equal(
      await mr.checkRole(member, 1),
      false,
      'user added to AB incorrectly'
    );
    assert.equal(roles[0].toNumber(), 1, 'Owner added to AB');
  });

  it('should add new role', async function() {
    let actionHash = encode(
      'addRole(bytes32,string,address)',
      '0x41647669736f727920426f617265000000000000000000000000000000000000',
      'New member role',
      owner
    );
    p1 = await gv.getProposalLength();
    mrLength = await mr.totalRoles();
    await gv.createProposalwithSolution(
      'Add new member',
      'Add new member',
      'Addnewmember',
      1,
      'Add new member',
      actionHash
    );
    p2 = await gv.getProposalLength();
    await gv.submitVote(p1.toNumber(), 1);
    await gv.closeProposal(p1.toNumber());
    mrLength1 = await mr.totalRoles();
    assert.isAbove(mrLength1.toNumber(), mrLength.toNumber(), 'Role not added');
  });

  it('should add a member to a role', async function() {
    var transaction = await mr.updateRole(member, 3, true);
    await assertRevert(mr.updateRole(member, 2, true));
    await assertRevert(mr.updateRole(member, 3, true));
    await assertRevert(mr.updateRole(member, 2, false, { from: other }));
    assert.equal(await mr.checkRole(member, 3), true, 'user not added to AB');
  });

  it('Should fetch all address by role id', async function() {
    const g3 = await mr.members(1);
    assert.equal(g3[1][0], owner);
  });

  it('Should fetch total number of members by role id', async function() {
    const g4 = await mr.numberOfMembers(3);
    assert.equal(g4.toNumber(), 1);
  });

  it('Should fetch member count of all roles', async function() {
    const g6 = await mr.getMemberLengthForAllRoles();
    assert.equal(g6.length, 4);
    assert.equal(g6[0].toNumber(), 0);
    assert.equal(g6[1].toNumber(), 1);
    assert.equal(g6[3].toNumber(), 1);
  });

  it('Should follow the upgradable interface', async function() {
    await mr.changeDependentContractAddress(); // just for interface, they do nothing
  });

  it('Should not list invalid member as valid', async function() {
    var a = await mr.checkRole(member, 1);
    await mr.updateRole(member, 3, false);
    assert.equal(
      await mr.checkRole(member, 3),
      false,
      'user incorrectly added to AB'
    );
    await mr.updateRole(member, 3, true);
    let members = await mr.members(1);
    assert.equal(members[1].length, 1);
    assert.equal(await mr.checkRole(member, 3), true, 'user not added to AB');
  });

  it('Should be able to remove member from a role', async function() {
    await mr.updateRole(member, 3, false);
    assert.equal(
      await mr.checkRole(member, 3),
      false,
      'user not removed from AB'
    );
    const g3 = await mr.members(3);
    assertRevert(mr.updateRole(member, 3, false));
  });

  it('Should not allow unauthorized people to update member roles', async function() {
    await mr.changeAuthorized(3, owner);
    await assertRevert(mr.changeAuthorized(3, owner, { from: other }));
    await assertRevert(mr.changeAuthorized(1, owner));
    await assertRevert(mr.updateRole(member, 3, true, { from: other }));
  });

  it('Should change authorizedAddress when rquested by authorizedAddress', async function() {
    await mr.changeAuthorized(3, member);
    assert.equal(
      await mr.authorized(3),
      member,
      'Authorized address not changed'
    );
  });

  it('Should get proper Roles', async () => {
    const mrs = await mr.roles(owner);
    assert.equal(await mr.checkRole(owner, 1), true, 'Owner not added to AB');
    assert.equal(mrs[0].toNumber(), 1);
    const mrs2 = await mr.roles(other);
  });

  it('Should allow anyone to be of member role 0', async () => {
    assert.equal(await mr.checkRole(owner, 0), true);
  });

  it('Should check role if user buys membership', async () => {
    await mr.payJoiningFee(member, { value: 2000000000000000, from: member });
    await mr.kycVerdict(member, true);
    assert.equal(await mr.checkRole(member, 2), true);
    assert.equal(await mr.checkRole(other, 2), false);
  });
});
