import { execSync } from "child_process";

export const truncate = (str: string, length: number) => {
  return str.length > length ? `${str.slice(0, length)}...` : str;
};

export const generateKey = () => {
  return Math.random().toString(32).substring(2);
};

export const getGithubRemoteFilePath = (
  projectRoot: string,
  relativeFileName: string
) => {
  try {
    const remoteUrl = execSync(
      `cd ${projectRoot} && git config --get remote.origin.url`
    )
      .toString()
      .trim();
    const commitHash = execSync(`cd ${projectRoot} && git rev-parse HEAD`)
      .toString()
      .trim();

    const match = /github\.com[:/](.+)\/(.+)\.git/.exec(remoteUrl);
    if (!match) {
      return undefined;
    }

    const [, userName, repoName] = match;
    return `https://github.com/${userName}/${repoName}/blob/${commitHash}/${relativeFileName}`;
  } catch {
    return undefined;
  }
};
