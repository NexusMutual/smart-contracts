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
  if (seq != 3) await gv.closeProposal(p);
  let proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
}

module.exports = { gvProposalWithIncentive, gvProposal };
