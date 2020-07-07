const increaseTime = require('./increaseTime.js').increaseTime;
const encode1 = require('./encoder.js').encode1;
const Web3 = require('web3');
const web3 = new Web3();
async function gvProposal(...args) {
  let catId = args[0];
  let actionHash = args[1];
  let mr = args[2];
  let gv = args[3];
  let seq = args[4];
  let p = await gv.getProposalLength();
  await gv.createProposal('proposal', 'proposal', 'proposal', 0);
  await gv.categorizeProposal(p, catId, 0);
  await gv.submitProposalWithSolution(p, 'proposal', actionHash);
  let members = await mr.members(seq);
  let iteration = 0;
  for (iteration = 0; iteration < members[1].length; iteration++)
    await gv.submitVote(p, 1, {
      from: members[1][iteration]
    });
  // console.log(await gv.proposalDetails(p));
  if (seq != 3) await gv.closeProposal(p);
  let proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
  if (seq != 1) await gv.triggerAction(p);
}

async function gvProposalWithIncentive(...args) {
  let catId = args[0];
  let actionHash = args[1];
  let mr = args[2];
  let gv = args[3];
  let seq = args[4];
  let incentive = args[5];
  let p = await gv.getProposalLength();
  await gv.createProposal('proposal', 'proposal', 'proposal', 0);
  await gv.categorizeProposal(p, catId, incentive);
  await gv.submitProposalWithSolution(p, 'proposal', actionHash);
  let members = await mr.members(seq);
  let iteration = 0;
  for (iteration = 0; iteration < members[1].length; iteration++)
    await gv.submitVote(p, 1, {
      from: members[1][iteration]
    });
  // console.log(await gv.proposalDetails(p));
  await increaseTime(604800);
  if (seq != 3) await gv.closeProposal(p);
  let proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
  await gv.triggerAction(p);
}

async function gvProposalWithoutTrigger(...args) {
  let catId = args[0];
  let actionHash = args[1];
  let mr = args[2];
  let gv = args[3];
  let seq = args[4];
  let p = await gv.getProposalLength();
  await gv.createProposal('proposal', 'proposal', 'proposal', 0);
  await gv.categorizeProposal(p, catId, 0);
  await gv.submitProposalWithSolution(p, 'proposal', actionHash);
  let members = await mr.members(seq);
  let iteration = 0;
  for (iteration = 0; iteration < members[1].length; iteration++)
    await gv.submitVote(p, 1, {
      from: members[1][iteration]
    });
  // console.log(await gv.proposalDetails(p));
  if (seq != 3) await gv.closeProposal(p);
  let proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
}

async function setTriggerActionTime(...args) {
  let mr = args[0];
  let gv = args[1];
  let actionHash = encode1(['bytes8', 'uint256'], [web3.utils.toHex('ACWT'), 0]);
  let p = await gv.getProposalLength();
  await gv.createProposal('proposal', 'proposal', 'proposal', 0);
  await gv.categorizeProposal(p, 22, 0);
  await gv.submitProposalWithSolution(p, 'proposal', actionHash);
  let members = await mr.members(2);
  let iteration = 0;
  for (iteration = 0; iteration < members[1].length; iteration++)
    await gv.submitVote(p, 1, {
      from: members[1][iteration]
    });
  // console.log(await gv.proposalDetails(p));
  await gv.closeProposal(p);
  let proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
  await increaseTime(86401);
  await gv.triggerAction(p);
}

module.exports = {
  gvProposalWithIncentive,
  gvProposal,
  setTriggerActionTime,
  gvProposalWithoutTrigger
};
