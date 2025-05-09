const COMMIT_TYPES = {
  breaking: 'major',
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  build: 'patch',
  chore: 'patch',
  refactor: 'patch',
  revert: 'patch',
  docs: null,
  style: null,
  test: null,
  ci: null,
};

const RELEASE_TYPES = {
  0: 'MAJOR',
  1: 'MINOR',
  2: 'PATCH',
};

const config = {
  whatBump: commits => {
    let level = null;
    let breakingCount = 0;
    let featureCount = 0;
    let patchCount = 0;

    commits.forEach(commit => {
      const locations = [commit.body, commit.subject, commit.footer];
      const notesTitles = (commit.notes || []).map(note => note.title);
      const allLocations = [...locations, ...notesTitles];
      const hasBreakingChangeText = allLocations.some(text => text?.includes('BREAKING CHANGE'));

      if (hasBreakingChangeText) {
        breakingCount++;
        return;
      }

      switch (COMMIT_TYPES[commit.type]) {
        case 'major':
          breakingCount++;
          break;
        case 'minor':
          featureCount++;
          break;
        case 'patch':
          patchCount++;
          break;
      }
    });

    if (breakingCount > 0) {
      level = 0;
    } else if (featureCount > 0) {
      level = 1;
    } else if (patchCount > 0) {
      level = 2;
    }

    const summary = `There are ${breakingCount} breaking changes, ${featureCount} features, and ${patchCount} patches`;
    const releaseMsg = level === null ? 'No version bump needed.' : `Bumping ${RELEASE_TYPES[level]} version.`;
    const reason = `${summary}. ${releaseMsg}`;
    
    console.warn(reason);

    return {
      level,
      reason,
    };
  },
};

module.exports = config;
