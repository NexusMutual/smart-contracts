const Governance = artifacts.require('Governance');
const NXMaster = artifacts.require('NXMaster');
const EventCaller = artifacts.require('EventCaller');

const AdvisoryBoard = '0x41420000';

let gv;
let nxms;

contract('Governance', ([owner, notOwner, voter, noStake]) => {
  before(async function() {
    nxms = await NXMaster.deployed();
    let address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
  });
  it('Should create a proposal', async function() {
    let eventCaller = await EventCaller.deployed();
    await nxms.setEventCallerAddress(eventCaller.address);
    await gv.changeDependentContractAddress();
    await gv.createProposal("Sample","Sample","Sample",0);
    console.log(await gv.getProposalLength());
  });

});