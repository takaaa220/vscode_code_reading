import * as vscode from "vscode";
import { join, relative } from "path";
import {
  accessSync,
  appendFileSync,
  constants,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { execSync } from "child_process";

export function activate(context: vscode.ExtensionContext) {
  const suffix = "code_memo";

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showInformationMessage("not in a workspace");
    return;
  }

  const projectRoot = workspaceFolders[0].uri.fsPath;

  const markdownMemoWriter = MarkdownMemoWriter(projectRoot);
  const inlineMemoWriter = InlineMemoWriter(projectRoot, suffix);

  const newMemo = async () => {
    const memoFiles = readdirSync(projectRoot)
      .filter((file) => file.endsWith(`.${suffix}.md`))
      .map((file) => file.replace(`.${suffix}.md`, ""));

    const newOption = "[Create new file]";

    const pickOptions = [newOption, ...memoFiles];
    const selected = await vscode.window.showQuickPick(pickOptions, {
      placeHolder: "Create new file or select existing memo",
    });

    if (!selected) {
      vscode.window.showErrorMessage("Please select options");
      return;
    }

    if (selected === newOption) {
      const title = await vscode.window.showInputBox({
        prompt: "Input memo title",
      });
      if (!title) {
        vscode.window.showErrorMessage("Please input memo title");
        return;
      }

      markdownMemoWriter.initializeMemo(title, suffix);
    } else {
      markdownMemoWriter.initializeMemo(selected, suffix);
    }

    vscode.window.showInformationMessage("Initialized memo!");
  };

  const addMemo = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No found active editor");
      return;
    }

    if (!markdownMemoWriter.initialized()) {
      await newMemo();
    }

    vscode.window.showInputBox({ prompt: "Input memo" }).then((inputText) => {
      if (inputText === undefined) {
        vscode.window.showErrorMessage("Please input memo");
        return;
      }

      markdownMemoWriter.addMemo(
        convert({
          inputText,
          document: editor.document,
          selection: editor.selection,
          projectRoot,
        })
      );

      vscode.window
        .showInformationMessage("Added memo!", "Open memo")
        .then((selection) => {
          if (selection !== "Open memo") {
            return;
          }

          vscode.workspace
            .openTextDocument(markdownMemoWriter.getCurrentActiveFile())
            .then((doc) => {
              vscode.window.showTextDocument(doc);
            });
        });
    });
  };

  let disposeNewMemo = vscode.commands.registerCommand(
    "extension.newMemo",
    newMemo
  );
  let disposeAddMemo = vscode.commands.registerCommand(
    "extension.addMemo",
    addMemo
  );
  const disposeOpenedFile = vscode.workspace.onDidOpenTextDocument(() => {
    inlineMemoWriter.reflect();
  });

  context.subscriptions.push(disposeNewMemo, disposeAddMemo, disposeOpenedFile);
}

export function deactivate() {}

const MarkdownMemoWriter = (workspaceRootPath: string) => {
  let currentActiveFile = "";

  const initializeMemo = (title: string, suffix: string) => {
    const fileNameWithExt = title.replace(/\s/g, "_");
    currentActiveFile = `${workspaceRootPath}/${fileNameWithExt}.${suffix}.md`;

    try {
      accessSync(currentActiveFile, constants.F_OK);
    } catch {
      writeFileSync(currentActiveFile, `# ${title}\n`);
    }
  };

  const addMemo = (addedText: string) => {
    if (!currentActiveFile) {
      return;
    }

    appendFileSync(currentActiveFile, addedText);
  };

  return {
    initialized: () => !!currentActiveFile,
    getCurrentActiveFile: () => currentActiveFile,
    initializeMemo,
    addMemo,
  };
};

type Convert = (input: {
  inputText: string;
  document: vscode.TextDocument;
  selection: vscode.Selection;
  projectRoot: string;
}) => string;

const convert: Convert = ({ inputText, document, selection, projectRoot }) => {
  const startLine = selection.start.line;
  const endLine = selection.end.line;

  const relativeFilePath = relative(projectRoot, document.fileName);
  const relativeFilePathWithLineNumber = `${relativeFilePath}#${startLine + 1}`;

  const githubUrl = (() => {
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
      return `https://github.com/${userName}/${repoName}/blob/${commitHash}/${relativeFilePath}#L${
        startLine + 1
      }-L${endLine + 1}`;
    } catch {
      return undefined;
    }
  })();

  const selectedText = [...Array(endLine - startLine + 1).keys()]
    .map((_, i) => {
      const line = startLine + i;
      return document.lineAt(line).text;
    })
    .join("\n");
  const ext = document.fileName.split(".").pop();
  const codeBlock = `\`\`\`${ext ?? ""}\n${selectedText}\n\`\`\``;

  return `\n${inputText}  \n[[ファイル](${relativeFilePathWithLineNumber})]${
    githubUrl ? ` [[GitHub](${githubUrl})]` : ""
  }\n\n${codeBlock}\n`;
};

type MemoJSONContent = {
  filePath: string;
  lineNumber: number;
  memo: string;
};

const InlineMemoWriter = (projectRoot: string, suffix: string) => {
  let map = new Map<MemoJSONContent["filePath"], MemoJSONContent[]>();

  const init = () => {
    map = new Map<MemoJSONContent["filePath"], MemoJSONContent[]>();

    const memoFilePaths = readdirSync(projectRoot)
      .filter((file) => file.endsWith(`.${suffix}.json`))
      .flatMap((file) => join(projectRoot, file));

    const memoJSONContents = memoFilePaths.flatMap((filePath) => {
      const file = readFileSync(filePath, "utf-8");
      return JSON.parse(file) as MemoJSONContent[];
    });

    memoJSONContents.forEach((memoJSONContent) => {
      map.set(memoJSONContent.filePath, [
        ...(map.get(memoJSONContent.filePath) ?? []),
        memoJSONContent,
      ]);
    });
  };

  const reflect = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No found active editor");
      return;
    }

    const filePath = editor.document.fileName;
    const relativeFilePath = relative(projectRoot, filePath);

    const memoJSONContents = map.get(relativeFilePath) ?? [];

    memoJSONContents.forEach((memoJSONContent) => {
      const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: `📝 ${memoJSONContent.memo}`,
          margin: "0 0 0 20px",
          color: "rgba(153, 153, 153, 0.7)",
        },
        isWholeLine: true,
      });

      const range = new vscode.Range(
        memoJSONContent.lineNumber,
        0,
        memoJSONContent.lineNumber,
        0
      );
      editor.setDecorations(decorationType, [range]);
    });
  };

  init();

  return {
    reset: init,
    reflect,
  };
};
