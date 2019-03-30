const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('GovernanceMock');
const ProposalCategory = artifacts.require('ProposalCategory');
const NXMaster = artifacts.require('NXMaster');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const assertRevert = require('./utils/assertRevert').assertRevert;
let pc;
let gv;
let tf;
let mr;
let nullAddress = '0x0000000000000000000000000000000000000000';
const encode = require('./utils/encoder.js').encode;

contract('Proposal Category', function([owner, other]) {
  before(async function() {
    nxms = await NXMaster.deployed();
    let address = await nxms.getLatestAddress('PC');
    pc = await ProposalCategory.at(address);
    address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
    tf = await TokenFunctions.deployed();
    address = await nxms.getLatestAddress('MR');
    mr = await MemberRoles.at(address);
  });

  it('14.1 Should be initialized', async function() {
    await assertRevert(pc.proposalCategoryInitiate());
    const g1 = await pc.totalCategories();
    const g2 = await pc.category(1);
    assert.equal(g2[1].toNumber(), 1);
    const g5 = await pc.categoryAction(1);
    assert.equal(g5[2].toString(), '0x4d52');
    const g6 = await pc.totalCategories();
    assert.equal(g6.toNumber(), 33);
  });

  it('14.2 should not allow unauthorized to change master address', async function() {
    await assertRevert(pc.changeMasterAddress(nxms.address, { from: other }));
  });

  it('14.3 Should add a proposal category', async function() {
    let c1 = await pc.totalCategories();
    await assertRevert(
      pc.addCategory('Yo', 1, 1, 0, [1], 1, '', nullAddress, 'EX', [0, 0, 0])
    );
    //proposal to add category
    let actionHash = encode(
      'addCategory(string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
      'Description',
      1,
      1,
      0,
      [1],
      1,
      '',
      nullAddress,
      'EX',
      [0, 0, 0, 1]
    );
    let p1 = await gv.getProposalLength();
    await gv.createProposalwithSolution(
      'Add new member',
      'Add new member',
      'Addnewmember',
      3,
      'Add new member',
      actionHash
    );
    await gv.submitVote(p1.toNumber(), 1);
    await gv.closeProposal(p1.toNumber());
    const c2 = await pc.totalCategories();
    assert.isAbove(c2.toNumber(), c1.toNumber(), 'category not added');
  });

  it('14.4 Should update a proposal category', async function() {
    let c1 = await pc.totalCategories();
    c1 = c1.toNumber() - 1;
    const cat1 = await pc.category(c1);
    await assertRevert(
      pc.updateCategory(c1, 'Yo', 1, 1, 0, [1], 1, '', nullAddress, 'EX', [
        0,
        0,
        0
      ])
    );
    //proposal to update category
    let actionHash = encode(
      'updateCategory(uint,string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
      c1,
      'YoYo',
      2,
      1,
      20,
      [1],
      1,
      '',
      nullAddress,
      'EX',
      [0, 0, 0]
    );
    let p1 = await gv.getProposalLength();
    await gv.createProposalwithSolution(
      'Add new member',
      'Add new member',
      'Addnewmember',
      4,
      'Add new member',
      actionHash
    );
    await gv.submitVote(p1.toNumber(), 1);
    await gv.closeProposal(p1.toNumber());
    let cat2 = await pc.category(c1);
    assert.notEqual(cat1[1], cat2[1], 'category not updated');
  });
});
