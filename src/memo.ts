export type MemoContent = {
  id: string;
  filePath: string;
  githubRemoteFilePath?: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  memo: string;
  selectedText: string;
};
