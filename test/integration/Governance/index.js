describe('Governance integration tests', function () {
  require('./createProposal');
  require('./createProposalwithSolution');
  require('./categorizeProposal');
  require('./submitProposalWithSolution');
  require('./updateProposal');
  require('./submitVote');
  require('./submitVoteWithoutDelegations');
  require('./closeProposal');
  require('./state');
  require('./updateUintParametars');
});
