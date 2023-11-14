import { readFileSync, readdirSync, writeFileSync } from "fs";
import { MemoContent } from "./memo";
import { join } from "path";
import { outputMarkdown } from "./output";

export const readMemoTitles = (projectRoot: string, suffix: string) => {
  return readdirSync(projectRoot)
    .filter((file) => file.endsWith(`.${suffix}.json`))
    .map((file) => file.replace(`.${suffix}.json`, ""));
};

export const readMemoContentFiles = (
  projectRoot: string,
  suffix: string
): {
  [filePath: MemoContent["filePath"]]: {
    memoTitle: string;
    content: MemoContent;
  }[];
} => {
  const memoTitleAndContents = readdirSync(projectRoot)
    .filter((fileName) => fileName.endsWith(`.${suffix}.json`))
    .map(
      (fileName) =>
        [
          fileName.replace(`.${suffix}.json`, ""),
          JSON.parse(
            readFileSync(join(projectRoot, fileName), "utf-8")
          ) as MemoContent[],
        ] as const
    );

  return memoTitleAndContents.reduce(
    (acc, [memoTitle, memoContents]) => {
      memoContents.forEach((memoContent) => {
        acc[memoContent.filePath] = [
          ...(acc[memoContent.filePath] ?? []),
          { memoTitle, content: memoContent },
        ];
      });

      return acc;
    },
    {} as {
      [filePath: MemoContent["filePath"]]: {
        memoTitle: string;
        content: MemoContent;
      }[];
    }
  );
};

export const writeToMemoFiles = ({
  projectRoot,
  suffix,
  memoTitle,
  memoContents,
}: {
  projectRoot: string;
  suffix: string;
  memoTitle: string;
  memoContents: MemoContent[];
}): { md: string; json: string } => {
  const normalizedMemoTitle = memoTitle.replace(/\//g, "_");

  const md = `${join(projectRoot, normalizedMemoTitle)}.${suffix}.md`;
  const json = `${join(projectRoot, normalizedMemoTitle)}.${suffix}.json`;

  writeFileSync(
    md,
    `# ${memoTitle}\n${memoContents.map(outputMarkdown).join("\n")}`
  );

  writeFileSync(json, JSON.stringify(memoContents, null, 2));

  return { md, json };
};
