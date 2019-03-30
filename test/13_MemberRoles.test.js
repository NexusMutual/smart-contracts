const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('GovernanceMock');
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
  });
  it('13.1 Should not be able to pay joining fee using ZERO_ADDRESS', async function() {
    await assertRevert(
      mr.payJoiningFee(ZERO_ADDRESS, { from: owner, value: fee })
    );
  });
  it('13.2 Should not allow a member(who has refund eligible) to pay joining fee', async function() {
    mr.payJoiningFee(member2, { from: member2, value: fee });
    await assertRevert(
      mr.payJoiningFee(member2, { from: member2, value: fee })
    );
    await mr.kycVerdict(member2, false);
  });
  it('13.3 Should not be able to pay joining fee for already a member', async function() {
    await assertRevert(mr.payJoiningFee(owner, { value: 2000000000000000 }));
  });
  it('13.4 Should not be able to trigger kyc using ZERO_ADDRESS', async function() {
    await assertRevert(mr.kycVerdict(ZERO_ADDRESS, true));
  });
  it('13.5 Should not be able to trigger kyc for already a member', async function() {
    await assertRevert(mr.kycVerdict(owner, true));
  });
  it('13.6 Should not allow a member(who has not refund eligible) to trigger kyc', async function() {
    await assertRevert(mr.kycVerdict(member2, true));
  });
  it('13.7 Kyc declined, refund will be done', async function() {
    await mr.payJoiningFee(member2, { from: member2, value: fee });
    await mr.kycVerdict(member2, false);
  });
  it('13.8 Should not be able to initiate member roles twice', async function() {
    let nxmToken = await nxms.dAppToken();
    await assertRevert(mr.memberRolesInitiate(owner, owner));
  });

  it('13.9 Should not allow unauthorized to change master address', async function() {
    await assertRevert(mr.changeMasterAddress(nxms.address, { from: other }));
  });

  it('13.10 Should have added initial member roles', async function() {
    const ab = await mr.totalRoles.call();
    assert.equal(ab.toNumber(), 4, 'Initial member roles not created');
  });

  it('13.11 Should have assigned Owner roles to owner', async function() {
    assert.equal(
      await mr.checkRole(owner, 3),
      true,
      'Owner not added to role Owner'
    );
  });

  it('13.12 Should not be able to update max AB count', async function() {
    await assertRevert(mr.changeMaxABCount(1, { from: other }));
  });

  it('13.13 Should not add initial AB members more than defined max AB count', async function() {
    let memberArray = [member, other, user1, user2, user3, member2];
    await assertRevert(mr.addInitialABMembers(memberArray));
  });

  it('13.14 should have added owner to AB', async function() {
    const roles = await mr.roles(owner);
    assert.equal(await mr.checkRole(owner, 1), true, 'Owner not added to AB');
    assert.equal(
      await mr.checkRole(member, 1),
      false,
      'user added to AB incorrectly'
    );
    assert.equal(roles[0].toNumber(), 1, 'Owner added to AB');
  });

  it('13.15 should add new role', async function() {
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

  it('13.16 should add a member to a role', async function() {
    var transaction = await mr.updateRole(member, 4, true);
    await assertRevert(mr.updateRole(member, 2, true));
    await assertRevert(mr.updateRole(member, 4, true));
    await assertRevert(mr.updateRole(member, 2, false, { from: other }));
    assert.equal(await mr.checkRole(member, 4), true, 'user not added to AB');
  });

  it('13.17 Should fetch all address by role id', async function() {
    const g3 = await mr.members(1);
    assert.equal(g3[1][0], owner);
  });

  it('13.18 Should fetch total number of members by role id', async function() {
    const g4 = await mr.numberOfMembers(4);
    assert.equal(g4.toNumber(), 1);
  });

  it('13.19 Should fetch member count of all roles', async function() {
    const g6 = await mr.getMemberLengthForAllRoles();
    assert.equal(g6.length, 5);
    assert.equal(g6[0].toNumber(), 0);
    assert.equal(g6[1].toNumber(), 1);
    assert.equal(g6[3].toNumber(), 1);
    assert.equal(g6[4].toNumber(), 1);
  });

  it('13.20 Should follow the upgradable interface', async function() {
    await mr.changeDependentContractAddress(); // just for interface, they do nothing
  });

  it('13.21 Should not list invalid member as valid', async function() {
    var a = await mr.checkRole(member, 1);
    await mr.updateRole(member, 4, false);
    assert.equal(
      await mr.checkRole(member, 4),
      false,
      'user incorrectly added to AB'
    );
    await mr.updateRole(member, 4, true);
    let members = await mr.members(4);
    assert.equal(members[1].length, 1);
    assert.equal(await mr.checkRole(member, 4), true, 'user not added to AB');
  });

  it('13.22 Should be able to remove member from a role', async function() {
    await mr.updateRole(member, 4, false);
    assert.equal(
      await mr.checkRole(member, 4),
      false,
      'user not removed from AB'
    );
    const g3 = await mr.members(4);
    await assertRevert(mr.updateRole(member, 4, false));
  });

  it('13.23 Should not allow unauthorized people to update member roles', async function() {
    await mr.changeAuthorized(4, owner);
    await assertRevert(mr.changeAuthorized(4, owner, { from: other }));
    await assertRevert(mr.changeAuthorized(1, owner));
    await assertRevert(mr.updateRole(member, 4, true, { from: other }));
  });

  it('13.24 Should change authorizedAddress when rquested by authorizedAddress', async function() {
    await mr.changeAuthorized(4, member);
    assert.equal(
      await mr.authorized(4),
      member,
      'Authorized address not changed'
    );
  });

  it('13.25 Should get proper Roles', async () => {
    const mrs = await mr.roles(owner);
    assert.equal(await mr.checkRole(owner, 1), true, 'Owner not added to AB');
    assert.equal(mrs[0].toNumber(), 1);
    const mrs2 = await mr.roles(other);
  });

  it('13.26 Should allow anyone to be of member role 0', async () => {
    assert.equal(await mr.checkRole(owner, 0), true);
  });

  it('13.27 Should check role if user buys membership', async () => {
    await mr.payJoiningFee(member, { value: 2000000000000000, from: member });
    await mr.kycVerdict(member, true);
    assert.equal(await mr.checkRole(member, 2), true);
    assert.equal(await mr.checkRole(other, 2), false);
  });

  it('13.28 Should not able to add members before launch by non-owner', async () => {
    await assertRevert(
      mr.addMembersBeforeLaunch(
        [user1, user2, user3],
        [100 * 1e18, 200 * 1e18, 300 * 1e18],
        { from: member }
      )
    );
  });

  it('13.29 Should not able to add members before launch if one of user is already member', async () => {
    await assertRevert(
      mr.addMembersBeforeLaunch(
        [owner, user2, user3],
        [100 * 1e18, 200 * 1e18, 300 * 1e18],
        { from: owner }
      )
    );
  });

  it('13.30 Should able to add members before launch', async () => {
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

  it('13.31 Should not able to add members before launch more than once', async () => {
    await assertRevert(
      mr.addMembersBeforeLaunch(
        [user1, user2, user3],
        [100 * 1e18, 200 * 1e18, 300 * 1e18],
        { from: owner }
      )
    );
  });
  it('13.32 Should not be able to swap owner manually', async () => {
    await assertRevert(mr.swapOwner(member));
  });
  it('13.33 Should not allow unauthorized address to set kyc status', async function() {
    await assertRevert(mr.kycVerdict(member2, true, { from: member }));
  });
});
