

// TODO: docs explaining since there are almost 10K members we should only iterate once over the list of members for efficiency
// calling each contract storage script that has member storage data


const getMemberData = () => {
  // semaphore
  const membersSemaphore = new Sema(100, { capacity: membersCount });
  // should just read storage
  
    const processMember = async i => {
      process.stdout.write(`\r[BEFORE] member ${i} of ${membersCount}`);
      const [member] = await this.memberRoles.memberAtIndex(Role.Member, i);

      this.contractData.assessment.before.member[member] = { hasAlreadyVotedOn: {}, votes: [] };
      this.contractData.tokenController.before.member[member] = { tokensLocked: {} };

      const [
        stake,
        rewards,
        voteCount,
        lockReasons,
        totalBalanceOf,
        getPendingRewards,
        isStakingPoolManager,
        totalBalanceOfWithoutDelegations,
      ] = await Promise.all([
        this.assessment.stakeOf(member),
        this.assessment.getRewards(member),
        this.assessment.getVoteCountOfAssessor(member),
        this.tokenController.getLockReasons(member),
        this.tokenController.totalBalanceOf(member),
        this.tokenController.getPendingRewards(member),
        this.tokenController.isStakingPoolManager(member),
        this.tokenController.totalBalanceOfWithoutDelegations(member),
      ]);

      const votesPromises = Array.from({ length: voteCount }, (_, i) => this.assessment.votesOf(member, i));
      const hasAlreadyVotedPromises = Array.from({ length: assessmentCount }).map(async (_, id) => {
        const hasAlreadyVotedResult = await this.assessment.hasAlreadyVotedOn(member, id);
        this.contractData.assessment.before.member[member].hasAlreadyVotedOn[id] = hasAlreadyVotedResult;
      });
      const lockReasonsPromises = lockReasons.map(async lockReason => {
        const amountLocked = await this.tokenController.tokensLocked(member, lockReason);
        this.contractData.tokenController.before.member[member].tokensLocked[lockReason] = amountLocked;
      });

      const [votes] = await Promise.all([
        Promise.all(votesPromises),
        Promise.all(hasAlreadyVotedPromises),
        Promise.all(lockReasonsPromises),
      ]);

      // Set assessment data
      this.contractData.assessment.before.member[member].stake = stake;
      this.contractData.assessment.before.member[member].rewards = rewards;
      this.contractData.assessment.before.member[member].votes = votes;

      // Set token controller data
      this.contractData.tokenController.before.member[member].lockReasons = lockReasons;
      this.contractData.tokenController.before.member[member].totalBalanceOf = totalBalanceOf;
      this.contractData.tokenController.before.member[member].getPendingRewards = getPendingRewards;
      this.contractData.tokenController.before.member[member].isStakingPoolManager = isStakingPoolManager;
      this.contractData.tokenController.before.member[member].totalBalanceOfWithoutDelegations =
        totalBalanceOfWithoutDelegations;

      membersSemaphore.release();

      return member;
    };

    const memberPromises = Array.from({ length: membersCount }, (_, i) =>
      membersSemaphore.acquire().then(() => processMember(i)),
    );

    this.contractData.memberRoles.members = await Promise.all(memberPromises);
};