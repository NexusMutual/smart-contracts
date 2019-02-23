const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const TokenController = artifacts.require('TokenController');
const ProposalCategory = artifacts.require('ProposalCategory');
const NXMaster = artifacts.require('NXMaster');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const NXMToken = artifacts.require('NXMToken');
const assertRevert = require('./utils/assertRevert').assertRevert;
const encode = require('./utils/encoder.js').encode;
const { ether } = require('./utils/ether');
const QuotationDataMock = artifacts.require('QuotationDataMock');

let mr;
let gv;
let pc;
let gbt;
let address;
let gvAddress;
let p1;
let mrLength;
let p2;
let tk;
let mrLength1;
let qd;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const fee = ether(0.002);

contract('MemberRoles', function([
  owner,
  member,
  other,
  user1,
  user2,
  user3,
  member2
]) {
  before(async function() {
    nxms = await NXMaster.deployed();
    address = await nxms.getLatestAddress('MR');
    mr = await MemberRoles.at(address);
    address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
    tf = await TokenFunctions.deployed();
    tk = await NXMToken.deployed();
    qd = await QuotationDataMock.deployed();
    await mr.payJoiningFee(owner, { value: 2000000000000000 });
    await mr.kycVerdict(owner, true);
  });
  it('Should not be able to pay joining fee using ZERO_ADDRESS', async function() {
    await assertRevert(
      mr.payJoiningFee(ZERO_ADDRESS, { from: owner, value: fee })
    );
  });
  it('Should not allow a member(who has refund eligible) to pay joining fee', async function() {
    await qd.setRefundEligible(member2, true);
    await assertRevert(
      mr.payJoiningFee(member2, { from: member2, value: fee })
    );
  });
  it('Should not be able to pay joining fee for already a member', async function() {
    await assertRevert(mr.payJoiningFee(owner, { value: 2000000000000000 }));
  });
  it('Should not be able to trigger kyc using ZERO_ADDRESS', async function() {
    await assertRevert(mr.kycVerdict(ZERO_ADDRESS, true));
  });
  it('Should not be able to trigger kyc for already a member', async function() {
    await assertRevert(mr.kycVerdict(owner, true));
  });
  it('Should not allow a member(who has not refund eligible) to trigger kyc', async function() {
    await qd.setRefundEligible(member2, false);
    await assertRevert(mr.kycVerdict(member2, true));
  });
  it('Kyc declined, refund will be done', async function() {
    await qd.setRefundEligible(member2, true);
    await mr.kycVerdict(member2, false);
  });
  it('Should not be able to initiate member roles twice', async function() {
    let nxmToken = await nxms.getLatestAddress('TK');
    await assertRevert(mr.memberRolesInitiate(nxmToken, owner, owner));
  });

  it('Should not allow unauthorized to change master address', async function() {
    await assertRevert(mr.changeMasterAddress(nxms.address, { from: other }));
    await mr.changeMasterAddress(nxms.address);
  });

  it('hould have added initial member roles', async function() {
    const ab = await mr.totalRoles.call();
    assert.equal(ab, 3, 'Initial member roles not created');
  });

  it('Only owner should be able to update Token controller address', async function() {
    let tcAddress = await TokenController.deployed();
    await mr.setDApp(tcAddress.address);
    await assertRevert(mr.setDApp(tcAddress.address, { from: other }));
  });

  it('Only owner should be able to update max AB count', async function() {
    await assertRevert(mr.changeMaxABCount(1, { from: other }));
    await mr.changeMaxABCount(1);
  });

  it('Should not add initial AB members more than defined max AB count', async function() {
    await assertRevert(mr.addInitialABMembers([member, other]));
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
    let members = await mr.members(3);
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
    await assertRevert(mr.updateRole(member, 3, false));
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

  it('Should not able to add members before launch by non-owner', async () => {
    await assertRevert(
      mr.addMembersBeforeLaunch(
        [user1, user2, user3],
        [100 * 1e18, 200 * 1e18, 300 * 1e18],
        { from: member }
      )
    );
  });

  it('Should not able to add members before launch if one of user is already member', async () => {
    await assertRevert(
      mr.addMembersBeforeLaunch(
        [owner, user2, user3],
        [100 * 1e18, 200 * 1e18, 300 * 1e18],
        { from: owner }
      )
    );
  });

  it('Should able to add members before launch', async () => {
    await mr.addMembersBeforeLaunch(
      [user1, user2, user3],
      [100 * 1e18, 200 * 1e18, 300 * 1e18],
      { from: owner }
    );
    assert.equal(await mr.checkRole(user1, 2), true);
    assert.equal(await mr.checkRole(user2, 2), true);
    assert.equal(await mr.checkRole(user3, 2), true);
    assert.equal(await tk.whiteListed(user1), true);
    assert.equal(await tk.whiteListed(user2), true);
    assert.equal(await tk.whiteListed(user3), true);
    assert.equal(await tk.balanceOf(user1), 100 * 1e18);
    assert.equal(await tk.balanceOf(user2), 200 * 1e18);
    assert.equal(await tk.balanceOf(user3), 300 * 1e18);
    assert.equal(await mr.launched(), true);
  });

  it('Should not able to add members before launch more than once', async () => {
    await assertRevert(
      mr.addMembersBeforeLaunch(
        [user1, user2, user3],
        [100 * 1e18, 200 * 1e18, 300 * 1e18],
        { from: owner }
      )
    );
  });
});
