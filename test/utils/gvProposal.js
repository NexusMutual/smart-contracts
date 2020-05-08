const increaseTime = require('./increaseTime.js').increaseTime;
async function gvProposal(...args) {
  let catId = args[0];
  let actionHash = args[1];
  let mr = args[2];
  let gv = args[3];
  let seq = args[4];

  const votingContracts = args[5];
  let p = await gv.getProposalLength();
  console.log('DEBUG 70');
  await gv.createProposal('proposal', 'proposal', 'proposal', 0);
  console.log('DEBUG 71');
  await gv.categorizeProposal(p, catId, 0);
  console.log('DEBUG 72');
  await gv.submitProposalWithSolution(p, 'proposal', actionHash);
  console.log('DEBUG 73');
  let members = await mr.members(seq);
  let iteration = 0;
  for (iteration = 0; iteration < members[1].length; iteration++) {
    const address = members[1][iteration];
    contract = votingContracts
      ? votingContracts.filter(
          c => c.address.toLowerCase() === address.toLowerCase()
        )[0]
      : null;
    if (contract) {
      console.log(`Voting with contract: ${members[1][iteration]}`);
      await contract.submitVote(p, 1);
      continue;
    }
    await gv.submitVote(p, 1, {
      from: members[1][iteration]
    });
  }

  console.log('DEBUG 81');

  // console.log(await gv.proposalDetails(p));
  if (seq != 3) await gv.closeProposal(p);
  console.log('DEBUG 82');
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
  await increaseTime(604800);
  if (seq != 3) await gv.closeProposal(p);
  let proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
}

module.exports = {gvProposalWithIncentive, gvProposal};
