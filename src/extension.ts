import * as vscode from "vscode";
import { relative } from "path";
import { appendFileSync, writeFileSync } from "fs";

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showInformationMessage("not in a workspace");
    return;
  }

  const projectRoot = workspaceFolders[0].uri.fsPath;

  const memoSaver = MemoSaver(projectRoot);
  memoSaver.newMemo({});

  let disposable = vscode.commands.registerCommand("extension.addNote", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("no active editor");
      return;
    }

    vscode.window.showInputBox({ prompt: "Input memo" }).then((inputText) => {
      if (inputText === undefined) {
        vscode.window.showErrorMessage("no input");
        return;
      }

      memoSaver.addMemo(
        convert({
          inputText,
          document: editor.document,
          selection: editor.selection,
          projectRoot,
        })
      );
      vscode.window
        .showInformationMessage(`Added memo!`, "Open memo")
        .then((selection) => {
          if (selection !== "Open memo") {
            return;
          }

          vscode.workspace
            .openTextDocument(memoSaver.getCurrentActiveFile())
            .then((doc) => {
              vscode.window.showTextDocument(doc);
            });
        });
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

const MemoSaver = (workspaceRootPath: string) => {
  const suffix = "code_memo";

  let currentActiveFile = "";

  const newMemo = ({
    fileNameWithoutExt: _fileNameWithoutExt,
    title: _title,
  }: {
    fileNameWithoutExt?: string;
    title?: string;
  }) => {
    const title = _title ?? "Code Reading Memo";
    const fileNameWithoutExt =
      _fileNameWithoutExt ??
      (() => {
        const now = new Date();
        return `memo_${now.getFullYear()}_${
          now.getMonth() + 1
        }_${now.getDate()}_${now.getHours()}_${now.getMinutes()}`;
      })();

    currentActiveFile = `${workspaceRootPath}/${fileNameWithoutExt}_${suffix}.md`;

    writeFileSync(currentActiveFile, `# ${title}\n`);
  };

  const addMemo = (addedText: string) => {
    if (!currentActiveFile) {
      newMemo({});
    }

    appendFileSync(currentActiveFile, addedText);
  };

  return {
    getCurrentActiveFile: () => currentActiveFile,
    newMemo,
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
