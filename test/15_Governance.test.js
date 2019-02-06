const Governance = artifacts.require('Governance');
const NXMaster = artifacts.require('NXMaster');
const EventCaller = artifacts.require('EventCaller');
const assertRevert = require('./utils/assertRevert.js').assertRevert;
const AdvisoryBoard = '0x41420000';

let gv;
let nxms;

contract('Governance', ([owner, notOwner, voter, noStake]) => {
  before(async function() {
    nxms = await NXMaster.deployed();
    let address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
  });

  it('should not allow unauthorized to change master address', async function() {
    await assertRevert(
      gv.changeMasterAddress(nxms.address, { from: notOwner })
    );
    await gv.changeMasterAddress(nxms.address);
  });

  it('Should create a proposal', async function() {
    let eventCaller = await EventCaller.deployed();
    let propLength = await gv.getProposalLength();
    await gv.createProposal('Sample', 'Sample', 'Sample', 0);
    let propLength2 = await gv.getProposalLength();
    assert.isAbove(
      propLength2.toNumber(),
      propLength.toNumber(),
      'Proposal not created'
    );
  });
});
