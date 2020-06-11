const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const NXMaster = artifacts.require('NXMasterMock');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const PoolData = artifacts.require('PoolDataMock');
const assertRevert = require('./utils/assertRevert').assertRevert;
const {toHex, toWei} = require('./utils/ethTools');

const gvProposal = require('./utils/gvProposal.js').gvProposal;
const {encode, encode1} = require('./utils/encoder.js');
const increaseTime = require('./utils/increaseTime.js').increaseTime;
let pc;
let gv;
let tf;
let mr;
let pd;
let nullAddress = '0x0000000000000000000000000000000000000000';

contract('Proposal Category', function([owner, other]) {
  before(async function() {
    tf = await TokenFunctions.deployed();
    nxms = await NXMaster.at(await tf.ms());
    let address = await nxms.getLatestAddress(toHex('PC'));
    pc = await ProposalCategory.at(address);
    address = await nxms.getLatestAddress(toHex('GV'));
    gv = await Governance.at(address);
    address = await nxms.getLatestAddress(toHex('MR'));
    mr = await MemberRoles.at(address);
    pd = await PoolData.deployed();
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
    await assertRevert(pc.changeMasterAddress(nxms.address, {from: other}));
  });

  it('14.3 Should not add a proposal category if member roles are invalid', async function() {
    let c1 = await pc.totalCategories();
    await assertRevert(
      pc.addCategory('Yo', 1, 1, 0, [1], 1, '', nullAddress, toHex('EX'), [
        0,
        0,
        0
      ])
    );
    //proposal to add category
    let actionHash = encode(
      'addCategory(string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
      'Description',
      1,
      1,
      0,
      [5],
      1,
      '',
      nullAddress,
      toHex('EX'),
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
    assert.equal(c2.toNumber(), c1.toNumber(), 'category added');
  });

  it('14.3 Should add a proposal category', async function() {
    let c1 = await pc.totalCategories();
    await assertRevert(
      pc.addCategory('Yo', 1, 1, 0, [1], 1, '', nullAddress, toHex('EX'), [
        0,
        0,
        0
      ])
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
      toHex('EX'),
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
  });

  it('14.4 Should update a proposal category', async function() {
    let c1 = await pc.totalCategories();
    c1 = c1.toNumber() - 1;
    const cat1 = await pc.category(c1);
    await assertRevert(
      pc.updateCategory(
        c1,
        'Yo',
        1,
        1,
        0,
        [1],
        1,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0]
      )
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
      toHex('EX'),
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

  it('14.5 Should not update a proposal category if member roles are invalid', async function() {
    let c1 = await pc.totalCategories();
    c1 = c1.toNumber() - 1;
    const cat1 = await pc.category(c1);
    await assertRevert(
      pc.updateCategory(
        c1,
        'Yo',
        1,
        1,
        0,
        [1],
        1,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0]
      )
    );
    //proposal to update category
    let actionHash = encode(
      'updateCategory(uint,string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
      c1,
      'YoYo',
      2,
      1,
      20,
      [7],
      1,
      '',
      nullAddress,
      toHex('EX'),
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

  it('Add new category with no action hash and contract address as master, category should not be created', async function() {
    //externalLiquidityTrade
    let actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'external Liquidity Trade',
        2,
        75,
        75,
        [2],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        pd.address,
        toHex('PD'),
        [0, 0, 0, 1],
        'externalLiquidityTrade()'
      ]
    );
    let categoryLengthOld = (await pc.totalCategories()).toNumber();
    pId = (await gv.getProposalLength()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    let categoryLengthNew = (await pc.totalCategories()).toNumber();
    assert.equal(categoryLengthNew, categoryLengthOld + 1);
    await increaseTime(604800);

    actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'Test',
        1,
        60,
        15,
        [2],
        604800,
        '',
        nullAddress,
        toHex('MS'),
        [0, 0, 0, 0],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    assert.equal((await gv.proposalActionStatus(pId)).toNumber(), 1);
    categoryLengthNew = (await pc.totalCategories()).toNumber();
    assert.equal(categoryLengthNew, categoryLengthOld);
  });

  it('Edit category with no action hash and contract address as master, category should not be updated', async function() {
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        2,
        'Test',
        1,
        65,
        15,
        [2],
        604800,
        '',
        nullAddress,
        toHex('MS'),
        [0, 0, 0, 0],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(2);
    assert.equal((await gv.proposalActionStatus(pId)).toNumber(), 1);
    assert.notEqual(category[2].toNumber(), 65, 'Category updated');
  });

  it('Edit category with invalid member roles, category should not be updated', async function() {
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        2,
        'Test',
        6,
        54,
        15,
        [5],
        604800,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0, 0],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(2);
    assert.equal((await gv.proposalActionStatus(pId)).toNumber(), 1);
    assert.notEqual(category[2].toNumber(), 65, 'Category updated');
  });

  it('Edit category with with special resolution and AB vote, category should not be updated', async function() {
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        2,
        'Test',
        1,
        54,
        15,
        [2],
        604800,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0, 1],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(2);
    assert.equal((await gv.proposalActionStatus(pId)).toNumber(), 1);
    assert.notEqual(category[2].toNumber(), 65, 'Category updated');
  });

  it('Edit category with with invalid special resolution flag, category should not be updated', async function() {
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        2,
        'Test',
        2,
        54,
        15,
        [2],
        604800,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0, 4],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(2);
    assert.equal((await gv.proposalActionStatus(pId)).toNumber(), 1);
    assert.notEqual(category[2].toNumber(), 65, 'Category updated');
  });

  it('Add category with valid action data and invalid votepercent, category should not be added', async function() {
    let categoryId = await pc.totalCategories();
    actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'New external Liquidity Trade',
        2,
        124,
        75,
        [2],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        pd.address,
        toHex('PD'),
        [0, 0, 0, 0],
        'externalLiquidityTrade()'
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 1, 'Action executed');
  });

  it('Add category with valid action data and invalid member roles, category should not be added', async function() {
    let categoryId = await pc.totalCategories();
    actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'New external Liquidity Trade',
        1,
        75,
        75,
        [9],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        pd.address,
        toHex('PD'),
        [0, 0, 0, 0],
        'externalLiquidityTrade()'
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 1, 'Action executed');
  });

  it('Add category with special resolution and AB vote, category should not be added', async function() {
    let categoryId = await pc.totalCategories();
    actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'New external Liquidity Trade',
        1,
        75,
        75,
        [2],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        pd.address,
        toHex('PD'),
        [0, 0, 0, 1],
        'externalLiquidityTrade()'
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 1, 'Action executed');
  });

  it('Add category with invalid special resolution flag , category should not be added', async function() {
    let categoryId = await pc.totalCategories();
    actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'New external Liquidity Trade',
        2,
        75,
        75,
        [2],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        pd.address,
        toHex('PD'),
        [0, 0, 0, 4],
        'externalLiquidityTrade()'
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 1, 'Action executed');
  });

  it('Edit category with valid action data and invalid votepercent, category should be not updated', async function() {
    let categoryId = 33;
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        categoryId,
        'external Liquidity Trade',
        2,
        124,
        75,
        [2],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        pd.address,
        toHex('PD'),
        [0, 0, 0, 1],
        'externalLiquidityTrade()'
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(categoryId);
    assert.notEqual(category[2].toNumber(), 124, 'Category updated');
  });

  it('Edit category with valid action hash and contract name, category should be updated', async function() {
    let categoryId = 33;
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        categoryId,
        'external Liquidity Trade',
        2,
        68,
        75,
        [2],
        604800,
        'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
        gv.address,
        toHex('EX'),
        [0, 0, 0, 1],
        'changeDependentContractAddress()'
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(categoryId);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 3, 'Action not executed');
  });

  it('Create proposal in category with external address', async function() {
    let categoryId = 33;
    pId = (await gv.getProposalLength()).toNumber();
    await gvProposal(categoryId, actionHash, mr, gv, 2);
    assert.equal((await gv.proposalActionStatus(pId)).toNumber(), 3);
  });

  it('Edit category with no hash and no contract name, category should be updated', async function() {
    let categoryId = 33;
    actionHash = encode1(
      [
        'uint256',
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        categoryId,
        'external Liquidity Trade',
        2,
        67,
        75,
        [2],
        604800,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0, 1],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(4, actionHash, mr, gv, 1);
    let category = await pc.category(categoryId);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 3, 'Action not executed');
  });

  it('Create proposal in category with no action, submit action, should revert', async function() {
    let categoryId = 33;
    actionHash = encode(
      'upgradeContractImplementation(bytes2,address)',
      toHex('GV'),
      gv.address
    );
    pId = (await gv.getProposalLength()).toNumber();
    await gv.createProposal('Proposal2', 'Proposal2', 'Proposal2', 0);
    await gv.categorizeProposal(pId, categoryId, 0);
    await assertRevert(
      gv.submitProposalWithSolution(pId, 'Upgrade', actionHash)
    );
    await gv.submitProposalWithSolution(pId, 'Upgrade', '0x');
    let members = await mr.members(2);
    let iteration = 0;
    for (iteration = 0; iteration < members[1].length; iteration++)
      await gv.submitVote(pId, 1, {
        from: members[1][iteration]
      });

    await increaseTime(604800);
    await gv.closeProposal(pId);
    await assertRevert(gv.rejectAction(pId));
    await increaseTime(86500);
    await assertRevert(gv.triggerAction(pId));
  });

  it('Add category with no action hash and valid data, category should be added', async function() {
    let categoryId = await pc.totalCategories();
    actionHash = encode1(
      [
        'string',
        'uint256',
        'uint256',
        'uint256',
        'uint256[]',
        'uint256',
        'string',
        'address',
        'bytes2',
        'uint256[]',
        'string'
      ],
      [
        'Test',
        2,
        75,
        75,
        [2],
        604800,
        '',
        nullAddress,
        toHex('EX'),
        [0, 0, 0, 0],
        ''
      ]
    );
    pId = (await gv.getProposalLength()).toNumber();
    categoryLengthOld = (await pc.totalCategories()).toNumber();
    await gvProposal(3, actionHash, mr, gv, 1);
    let proposalActionStatus = await gv.proposalActionStatus(pId);
    assert.equal(proposalActionStatus.toNumber(), 3, 'Action not executed');
  });
});
