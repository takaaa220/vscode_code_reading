import * as vscode from "vscode";
import { relative } from "path";
import {
  accessSync,
  appendFileSync,
  constants,
  readdirSync,
  writeFileSync,
} from "fs";

export function activate(context: vscode.ExtensionContext) {
  const suffix = "code_memo";

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showInformationMessage("not in a workspace");
    return;
  }

  const projectRoot = workspaceFolders[0].uri.fsPath;

  const memoWriter = MemoWriter(projectRoot);

  const newMemo = async () => {
    const memoFiles = readdirSync(projectRoot)
      .filter((file) => file.endsWith(`.${suffix}.md`))
      .map((file) => file.replace(`.${suffix}.md`, ""));

    const newOption = "Create new file";

    const pickOptions = [newOption, ...memoFiles];
    const selected = await vscode.window.showQuickPick(pickOptions, {
      placeHolder: "Create new file or select existing memo",
    });

    if (!selected) {
      vscode.window.showErrorMessage("select options");
      return;
    }

    if (selected === newOption) {
      const title = await vscode.window.showInputBox({
        prompt: "Input memo title",
      });
      if (!title) {
        vscode.window.showErrorMessage("input title");
        return;
      }

      memoWriter.initializeMemo(title, suffix);
    } else {
      memoWriter.initializeMemo(selected, suffix);
    }

    vscode.window.showInformationMessage("Initialized memo!");
  };

  const addMemo = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("no active editor");
      return;
    }

    if (!memoWriter.initialized()) {
      await newMemo();
    }

    vscode.window.showInputBox({ prompt: "Input memo" }).then((inputText) => {
      if (inputText === undefined) {
        vscode.window.showErrorMessage("input memo");
        return;
      }

      memoWriter.addMemo(
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
            .openTextDocument(memoWriter.getCurrentActiveFile())
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
  context.subscriptions.push(disposeNewMemo, disposeAddMemo);
}

export function deactivate() {}

const MemoWriter = (workspaceRootPath: string) => {
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

  const relativeFilePathWithLineNumber = `${relative(
    projectRoot,
    document.fileName
  )}#${startLine + 1}`;
  const githubUrl = "https://github.com";

  const selectedText = [...Array(endLine - startLine + 1).keys()]
    .map((_, i) => {
      const line = startLine + i;
      return document.lineAt(line).text;
    })
    .join("\n");
  const ext = document.fileName.split(".").pop();
  const codeBlock = `\`\`\`${ext ?? ""}\n${selectedText}\n\`\`\``;

  return `\n${inputText}  \n[[ファイル](${relativeFilePathWithLineNumber})] [[GitHub](${githubUrl})]\n\n${codeBlock}\n`;
};
