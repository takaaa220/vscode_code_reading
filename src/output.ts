import { MemoContent } from "./memo";

type Output = (memoContent: MemoContent) => string;

export const outputMarkdown: Output = ({
  memo,
  startLine,
  startCharacter,
  endLine,
  endCharacter,
  filePath,
  githubRemoteFilePath,
  selectedText,
}) => {
  const ext = filePath.split(".").pop();
  const codeBlock = `\`\`\`${ext ?? ""}\n${selectedText}\n\`\`\``;

  return `${memo}  \n[[ファイル](${filePath}#L${startLine + 1})]${
    githubRemoteFilePath
      ? ` [[GitHub](${githubRemoteFilePath}#L${startLine + 1}C${
          startCharacter + 1
        }-L${endLine + 1}C${endCharacter + 1})]`
      : ""
  }\n\n${codeBlock}\n`;
};
